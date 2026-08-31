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
  complete(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  latencyMs: number;
}

/** Any embedding provider must implement this. */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
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
