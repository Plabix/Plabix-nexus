export interface AIConfig {
  provider: "ollama"; // only local providers are enabled; extend the union to add more
  ollama: {
    baseUrl: string;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions: number;
    /** Context window passed to Ollama. Its default (2-4k) truncates RAG prompts silently. */
    numCtx: number;
    /** How long Ollama keeps a model in memory after a request (e.g. "30m"); avoids cold reloads. */
    keepAlive: string;
    chatTimeoutMs: number;
    embeddingTimeoutMs: number;
    /** Texts per /api/embed request during ingestion. */
    embeddingBatchSize: number;
    /** Task prefixes some embedding models are trained with (nomic-embed-text needs them). */
    queryPrefix: string;
    documentPrefix: string;
    /** For reasoning models (qwen3, deepseek-r1): send `think: <value>` when set. */
    think: boolean | undefined;
  };
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envBoolean(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function loadAIConfig(): AIConfig {
  const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
  const isNomic = embeddingModel.startsWith("nomic-embed");
  return {
    provider: "ollama",
    ollama: {
      baseUrl: (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, ""),
      chatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.2",
      embeddingModel,
      embeddingDimensions: envNumber("OLLAMA_EMBEDDING_DIMENSIONS", 768),
      // 4096 fits the RAG prompt (~3k tokens max) and keeps memory low on CPU-only machines.
      numCtx: envNumber("OLLAMA_NUM_CTX", 4096),
      keepAlive: process.env.OLLAMA_KEEP_ALIVE || "30m",
      chatTimeoutMs: envNumber("OLLAMA_CHAT_TIMEOUT_MS", 180_000),
      embeddingTimeoutMs: envNumber("OLLAMA_EMBEDDING_TIMEOUT_MS", 120_000),
      embeddingBatchSize: envNumber("OLLAMA_EMBEDDING_BATCH_SIZE", 16),
      queryPrefix: process.env.OLLAMA_EMBEDDING_QUERY_PREFIX ?? (isNomic ? "search_query: " : ""),
      documentPrefix:
        process.env.OLLAMA_EMBEDDING_DOCUMENT_PREFIX ?? (isNomic ? "search_document: " : ""),
      think: envBoolean("OLLAMA_THINK"),
    },
  };
}
