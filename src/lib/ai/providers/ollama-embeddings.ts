import type { EmbeddingProvider, EmbeddingResult } from "../types";
import { AIProviderError } from "../types";

interface OllamaEmbeddingConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
}

/** EmbeddingProvider backed by a local Ollama instance (e.g. nomic-embed-text). */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaEmbeddingConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const start = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });
    } catch (err) {
      throw new AIProviderError(
        "Local AI service is unavailable. Start Ollama and try again.",
        this.name,
        err
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new AIProviderError(
        `Ollama embedding request failed (${response.status}): ${errText || "unknown error"}`,
        this.name
      );
    }

    const data = (await response.json()) as { embedding?: number[] };
    if (!data.embedding || data.embedding.length === 0) {
      throw new AIProviderError("Ollama returned an empty embedding.", this.name);
    }

    return { embedding: data.embedding, model: this.model, latencyMs: Date.now() - start };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Ollama's /api/embeddings endpoint is single-text; batch sequentially.
    // Kept as its own method so a future provider (e.g. one with native batch
    // support) can override this without changing call sites.
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
