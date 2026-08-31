import type { ChatProvider, EmbeddingProvider } from "./types";
import { loadAIConfig } from "./config";
import { OllamaChatProvider } from "./providers/ollama-chat";
import { OllamaEmbeddingProvider } from "./providers/ollama-embeddings";

/**
 * Single point of truth for "which AI provider are we using".
 * The rest of the application imports getChatProvider()/getEmbeddingProvider()
 * and never touches Ollama (or any future provider) directly.
 *
 * To add a new provider (OpenAI, Gemini, Anthropic, ...):
 *   1. Implement ChatProvider and/or EmbeddingProvider in ./providers/<name>.ts
 *   2. Add a case below
 *   3. Set AI_PROVIDER env var
 * No other code needs to change.
 */
let chatProvider: ChatProvider | null = null;
let embeddingProvider: EmbeddingProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (chatProvider) return chatProvider;
  const config = loadAIConfig();
  switch (config.provider) {
    case "ollama":
    default:
      chatProvider = new OllamaChatProvider({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.chatModel,
      });
  }
  return chatProvider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  const config = loadAIConfig();
  switch (config.provider) {
    case "ollama":
    default:
      embeddingProvider = new OllamaEmbeddingProvider({
        baseUrl: config.ollama.baseUrl,
        model: config.ollama.embeddingModel,
        dimensions: config.ollama.embeddingDimensions,
      });
  }
  return embeddingProvider;
}
