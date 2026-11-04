import type { EmbeddingProvider, EmbeddingPurpose, EmbeddingResult } from "../types";
import { AIProviderError } from "../types";
import { ollamaPost } from "./ollama-http";

interface OllamaEmbeddingConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  batchSize: number;
  queryPrefix: string;
  documentPrefix: string;
  keepAlive: string;
}

/**
 * Throws unless `vector` is a non-empty array of finite numbers with the
 * expected length. Storing a wrong-sized or NaN vector would either fail the
 * insert or silently poison similarity search.
 */
export function assertValidEmbedding(vector: unknown, expectedDimensions: number): number[] {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new AIProviderError("The embedding model returned an empty embedding.", "ollama");
  }
  if (vector.length !== expectedDimensions) {
    throw new AIProviderError(
      `Embedding has ${vector.length} dimensions but the database expects ${expectedDimensions}. ` +
        "Check OLLAMA_EMBEDDING_MODEL and OLLAMA_EMBEDDING_DIMENSIONS.",
      "ollama"
    );
  }
  if (!vector.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new AIProviderError("The embedding model returned invalid values.", "ollama");
  }
  if (vector.every((v) => v === 0)) {
    throw new AIProviderError("The embedding model returned an all-zero vector.", "ollama");
  }
  return vector as number[];
}

/** EmbeddingProvider backed by a local Ollama instance (e.g. nomic-embed-text). */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly model: string;
  readonly dimensions: number;
  private readonly config: OllamaEmbeddingConfig;

  constructor(config: OllamaEmbeddingConfig) {
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(text: string, purpose: EmbeddingPurpose = "query"): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text], purpose);
    return result!;
  }

  async embedBatch(
    texts: string[],
    purpose: EmbeddingPurpose = "document"
  ): Promise<EmbeddingResult[]> {
    const prefix = purpose === "query" ? this.config.queryPrefix : this.config.documentPrefix;
    const results: EmbeddingResult[] = [];

    // /api/embed accepts an array input; send bounded batches so one huge
    // document cannot produce a single request that exceeds the timeout.
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      const start = Date.now();
      const data = await ollamaPost<{ embeddings?: unknown[] }>(
        `${this.config.baseUrl}/api/embed`,
        {
          model: this.model,
          input: batch.map((t) => prefix + t),
          truncate: true,
          keep_alive: this.config.keepAlive,
        },
        { timeoutMs: this.config.timeoutMs, retries: 2 }
      );

      if (!Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) {
        throw new AIProviderError(
          "The embedding model returned an unexpected number of embeddings.",
          this.name
        );
      }
      const latencyMs = Date.now() - start;
      for (const vector of data.embeddings) {
        results.push({
          embedding: assertValidEmbedding(vector, this.dimensions),
          model: this.model,
          latencyMs,
        });
      }
    }
    return results;
  }
}
