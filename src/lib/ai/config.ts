export interface AIConfig {
  provider: "ollama"; // extend union when adding: "openai" | "gemini" | "anthropic"
  ollama: {
    baseUrl: string;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions: number;
  };
}

export function loadAIConfig(): AIConfig {
  return {
    provider: (process.env.AI_PROVIDER as AIConfig["provider"]) || "ollama",
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      chatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.2",
      embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
      embeddingDimensions: Number(process.env.OLLAMA_EMBEDDING_DIMENSIONS || 768),
    },
  };
}
