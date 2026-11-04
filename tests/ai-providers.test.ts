import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaEmbeddingProvider, assertValidEmbedding } from "@/lib/ai/providers/ollama-embeddings";
import { OllamaChatProvider, stripReasoning } from "@/lib/ai/providers/ollama-chat";
import { AIProviderError } from "@/lib/ai/types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const embedConfig = {
  baseUrl: "http://ollama.test",
  model: "nomic-embed-text",
  dimensions: 3,
  timeoutMs: 1000,
  batchSize: 2,
  queryPrefix: "search_query: ",
  documentPrefix: "search_document: ",
  keepAlive: "30m",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertValidEmbedding", () => {
  it("accepts a well-formed vector", () => {
    expect(assertValidEmbedding([0.1, 0.2, 0.3], 3)).toEqual([0.1, 0.2, 0.3]);
  });

  it.each([
    ["empty", []],
    ["wrong dimensions", [0.1, 0.2]],
    ["NaN values", [0.1, Number.NaN, 0.3]],
    ["all zeros", [0, 0, 0]],
    ["not an array", "nope"],
  ])("rejects %s", (_label, vector) => {
    expect(() => assertValidEmbedding(vector, 3)).toThrow(AIProviderError);
  });
});

describe("OllamaEmbeddingProvider", () => {
  it("applies task prefixes and splits work into batches", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { input: string[] };
      return jsonResponse({ embeddings: body.input.map(() => [0.1, 0.2, 0.3]) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OllamaEmbeddingProvider(embedConfig);

    const results = await provider.embedBatch(["a", "b", "c"], "document");
    expect(results).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(firstBody.input).toEqual(["search_document: a", "search_document: b"]);

    await provider.embed("question", "query");
    const queryBody = JSON.parse(fetchMock.mock.calls[2]![1].body as string);
    expect(queryBody.input).toEqual(["search_query: question"]);
  });

  it("fails loudly when the model returns the wrong dimensions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ embeddings: [[0.1, 0.2]] })));
    await expect(new OllamaEmbeddingProvider(embedConfig).embed("x")).rejects.toThrow(/dimensions/);
  });

  it("retries transient 5xx errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, 503))
      .mockResolvedValueOnce(jsonResponse({ embeddings: [[0.1, 0.2, 0.3]] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new OllamaEmbeddingProvider(embedConfig).embed("x")).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a missing model and explains the problem", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'model "nomic-embed-text" not found' }, 404));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new OllamaEmbeddingProvider(embedConfig).embed("x")).rejects.toThrow(/not installed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an unreachable Ollama clearly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(new OllamaEmbeddingProvider({ ...embedConfig }).embed("x")).rejects.toThrow(
      /unavailable/
    );
  });
});

describe("OllamaChatProvider", () => {
  it("sends the context window and strips reasoning blocks", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message: { content: "<think>hmm</think>Answer [1]." } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OllamaChatProvider({
      baseUrl: "http://ollama.test/",
      model: "llama3.2",
      numCtx: 4096,
      keepAlive: "30m",
      timeoutMs: 1000,
    });
    const result = await provider.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(result.content).toBe("Answer [1].");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://ollama.test/api/chat");
    expect(JSON.parse(init.body as string).options.num_ctx).toBe(4096);
  });

  it("stripReasoning leaves normal text alone", () => {
    expect(stripReasoning("Plain answer.")).toBe("Plain answer.");
  });
});
