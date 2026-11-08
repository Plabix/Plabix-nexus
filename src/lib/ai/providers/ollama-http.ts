import { AIProviderError } from "../types";

const PROVIDER = "ollama";

export interface OllamaRequestOptions {
  timeoutMs: number;
  /** Extra attempts after the first for network errors, 5xx and timeouts. */
  retries?: number;
}

/**
 * Auth header for a protected gateway (e.g. Cloudflare Tunnel) in front of Ollama.
 * Server-side only; empty when OLLAMA_GATEWAY_TOKEN is not set (plain local Ollama).
 */
export function ollamaGatewayHeaders(): Record<string, string> {
  const token = process.env.OLLAMA_GATEWAY_TOKEN?.trim();
  return token ? { "x-ollama-gateway-token": token } : {};
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POSTs JSON to Ollama with a hard timeout and bounded retries, converting every
 * failure into an AIProviderError with a message that is safe to show users.
 */
export async function ollamaPost<T>(
  url: string,
  body: unknown,
  { timeoutMs, retries = 1 }: OllamaRequestOptions
): Promise<T> {
  let lastError: AIProviderError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ollamaGatewayHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      lastError = new AIProviderError(
        timedOut
          ? "The local AI model took too long to respond. Try again, or use a smaller model."
          : "Local AI service is unavailable. Start Ollama and try again.",
        PROVIDER,
        err
      );
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const text = await response.text().catch(() => "");
    const modelMissing = response.status === 404 && /not found/i.test(text);
    const error = new AIProviderError(
      modelMissing
        ? `A required AI model is not installed in Ollama. ${extractOllamaError(text)}`
        : `Local AI request failed (${response.status}). ${extractOllamaError(text)}`.trim(),
      PROVIDER
    );
    // 4xx (bad request, missing model) will not succeed on retry.
    if (response.status < 500) throw error;
    lastError = error;
  }

  throw lastError ?? new AIProviderError("Local AI request failed.", PROVIDER);
}

function extractOllamaError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (parsed.error) return parsed.error.slice(0, 300);
  } catch {
    // not JSON
  }
  return text.slice(0, 300);
}
