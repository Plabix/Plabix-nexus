import type {
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatProvider,
} from "../types";
import { ollamaPost } from "./ollama-http";

interface OllamaChatConfig {
  baseUrl: string;
  model: string;
  numCtx: number;
  keepAlive: string;
  timeoutMs: number;
  think?: boolean;
}

/** Removes <think>…</think> reasoning blocks emitted by reasoning models. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/** ChatProvider backed by a local Ollama instance. Free, no API key required. */
export class OllamaChatProvider implements ChatProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly config: OllamaChatConfig;

  constructor(config: OllamaChatConfig) {
    this.config = { ...config, baseUrl: config.baseUrl.replace(/\/$/, "") };
    this.model = config.model;
  }

  async complete(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const start = Date.now();
    const data = await ollamaPost<{ message?: { content?: string } }>(
      `${this.config.baseUrl}/api/chat`,
      {
        model: this.model,
        messages: options.messages,
        stream: false,
        keep_alive: this.config.keepAlive,
        ...(this.config.think !== undefined ? { think: this.config.think } : {}),
        options: {
          temperature: options.temperature ?? 0.2,
          num_predict: options.maxTokens ?? 1024,
          num_ctx: this.config.numCtx,
        },
      },
      // Generation is expensive; retrying a timed-out generation doubles the wait.
      { timeoutMs: this.config.timeoutMs, retries: 0 }
    );

    return {
      content: stripReasoning(data.message?.content ?? ""),
      model: this.model,
      latencyMs: Date.now() - start,
    };
  }
}
