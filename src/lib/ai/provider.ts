import type { ChatProvider, EmbeddingProvider, ProviderHealth } from "./types";
import { loadAIConfig } from "./config";
import { OllamaChatProvider } from "./providers/ollama-chat";
import { OllamaEmbeddingProvider } from "./providers/ollama-embeddings";
import { ollamaGatewayHeaders } from "./providers/ollama-http";

/**
 * Single point of truth for "which AI provider are we using".
 * The rest of the application imports getChatProvider()/getEmbeddingProvider()
 * and never touches Ollama (or any future provider) directly.
 *
 * To add another local provider (e.g. llama.cpp server, LM Studio, vLLM):
 *   1. Implement ChatProvider and/or EmbeddingProvider in ./providers/<name>.ts
 *   2. Add a case below and to AIConfig["provider"]
 * No other code needs to change. Paid hosted APIs are intentionally not wired in.
 */
let chatProvider: ChatProvider | null = null;
let embeddingProvider: EmbeddingProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (chatProvider) return chatProvider;
  const { ollama } = loadAIConfig();
  chatProvider = new OllamaChatProvider({
    baseUrl: ollama.baseUrl,
    model: ollama.chatModel,
    numCtx: ollama.numCtx,
    keepAlive: ollama.keepAlive,
    timeoutMs: ollama.chatTimeoutMs,
    think: ollama.think,
  });
  return chatProvider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  const { ollama } = loadAIConfig();
  embeddingProvider = new OllamaEmbeddingProvider({
    baseUrl: ollama.baseUrl,
    model: ollama.embeddingModel,
    dimensions: ollama.embeddingDimensions,
    timeoutMs: ollama.embeddingTimeoutMs,
    batchSize: ollama.embeddingBatchSize,
    queryPrefix: ollama.queryPrefix,
    documentPrefix: ollama.documentPrefix,
    keepAlive: ollama.keepAlive,
  });
  return embeddingProvider;
}

/** Ollama reports "llama3.2:latest" for a model configured as "llama3.2". */
function hasModel(installed: string[], wanted: string): boolean {
  const normalized = wanted.includes(":") ? wanted : `${wanted}:latest`;
  return installed.includes(wanted) || installed.includes(normalized);
}

/** Checks that the AI runtime is reachable and the configured models are installed. */
export async function checkAIHealth(): Promise<ProviderHealth> {
  const { ollama } = loadAIConfig();
  const models = [
    { name: ollama.chatModel, role: "chat" as const },
    { name: ollama.embeddingModel, role: "embedding" as const },
  ];
  try {
    const res = await fetch(`${ollama.baseUrl}/api/tags`, {
      headers: ollamaGatewayHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return {
        reachable: false,
        models: models.map((m) => ({ ...m, available: false })),
        error: `Ollama responded with ${res.status}.`,
      };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const installed = (data.models ?? []).map((m) => m.name);
    return {
      reachable: true,
      models: models.map((m) => ({ ...m, available: hasModel(installed, m.name) })),
    };
  } catch {
    return {
      reachable: false,
      models: models.map((m) => ({ ...m, available: false })),
      error: "Ollama is not reachable. Start it with `ollama serve`.",
    };
  }
}
