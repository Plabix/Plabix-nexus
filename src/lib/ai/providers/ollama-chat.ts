import type {
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatProvider,
} from "../types";
import { AIProviderError } from "../types";

interface OllamaChatConfig {
  baseUrl: string;
  model: string;
}

/** ChatProvider backed by a local Ollama instance. Free, no API key required. */
export class OllamaChatProvider implements ChatProvider {
  readonly name = "ollama";
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OllamaChatConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
  }

  async complete(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const start = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 1024,
          },
        }),
      });
    } catch (err) {
      throw new AIProviderError(
        "Local AI service is unavailable. Start Ollama and try again.",
        this.name,
        err
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AIProviderError(
        `Ollama chat request failed (${response.status}): ${text || "unknown error"}`,
        this.name
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };

    return {
      content: data.message?.content?.trim() ?? "",
      model: this.model,
      latencyMs: Date.now() - start,
    };
  }
}
