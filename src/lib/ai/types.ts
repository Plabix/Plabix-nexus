export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  latencyMs: number;
}

/** Any chat-capable LLM provider must implement this. */
export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  complete(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  latencyMs: number;
}

/**
 * "query" embeds a user question, "document" embeds a chunk being indexed.
 * Asymmetric models (e.g. nomic-embed-text) need different task prefixes.
 */
export type EmbeddingPurpose = "query" | "document";

/** Any embedding provider must implement this. */
export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string, purpose?: EmbeddingPurpose): Promise<EmbeddingResult>;
  embedBatch(texts: string[], purpose?: EmbeddingPurpose): Promise<EmbeddingResult[]>;
}

export interface ModelStatus {
  name: string;
  role: "chat" | "embedding";
  available: boolean;
}

export interface ProviderHealth {
  reachable: boolean;
  models: ModelStatus[];
  error?: string;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
