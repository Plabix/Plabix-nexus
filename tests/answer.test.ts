import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/rag/retrieval", () => ({
  retrieveRelevantChunks: vi.fn(),
}));
vi.mock("@/lib/ai/provider", () => ({
  getChatProvider: vi.fn(),
}));
vi.mock("@/lib/observability/logger", () => ({
  logAIUsage: vi.fn(),
}));

import { retrieveRelevantChunks } from "@/lib/rag/retrieval";
import { getChatProvider } from "@/lib/ai/provider";
import { answerQuestion, NOT_FOUND_MESSAGE } from "@/lib/rag/answer";

describe("answerQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the not-found message when no chunks are retrieved", async () => {
    vi.mocked(retrieveRelevantChunks).mockResolvedValue([]);

    const result = await answerQuestion("org-1", "What is the capital of France?");

    expect(result.answer).toBe(NOT_FOUND_MESSAGE);
    expect(result.sources).toHaveLength(0);
  });

  it("returns a grounded answer with sources when chunks are found", async () => {
    vi.mocked(retrieveRelevantChunks).mockResolvedValue([
      {
        chunkId: "c1",
        documentId: "d1",
        documentName: "Employee Handbook.pdf",
        content: "Annual Leave: 24 days per year.",
        similarity: 0.91,
      },
    ]);
    vi.mocked(getChatProvider).mockReturnValue({
      name: "ollama",
      model: "llama3.2",
      complete: vi.fn().mockResolvedValue({
        content: "Employees receive 24 days of annual leave per year.",
        model: "llama3.2",
        latencyMs: 120,
      }),
    });

    const result = await answerQuestion("org-1", "How many annual leave days?");

    expect(result.answer).toContain("24 days");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.documentName).toBe("Employee Handbook.pdf");
  });

  it("de-duplicates sources from the same document", async () => {
    vi.mocked(retrieveRelevantChunks).mockResolvedValue([
      {
        chunkId: "c1",
        documentId: "d1",
        documentName: "Policy.pdf",
        content: "chunk 1",
        similarity: 0.8,
      },
      {
        chunkId: "c2",
        documentId: "d1",
        documentName: "Policy.pdf",
        content: "chunk 2",
        similarity: 0.95,
      },
    ]);
    vi.mocked(getChatProvider).mockReturnValue({
      name: "ollama",
      model: "llama3.2",
      complete: vi.fn().mockResolvedValue({ content: "Answer.", model: "llama3.2", latencyMs: 50 }),
    });

    const result = await answerQuestion("org-1", "question");

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.similarity).toBe(0.95);
  });

  it("drops citations when the model says the answer is not in the documents", async () => {
    vi.mocked(retrieveRelevantChunks).mockResolvedValue([
      { chunkId: "c1", documentId: "d1", documentName: "Policy.pdf", content: "Annual Leave: 24 days.", similarity: 0.66 },
    ]);
    vi.mocked(getChatProvider).mockReturnValue({
      name: "ollama",
      model: "llama3.2",
      complete: vi.fn().mockResolvedValue({ content: NOT_FOUND_MESSAGE, model: "llama3.2", latencyMs: 40 }),
    });

    const result = await answerQuestion("org-1", "What is the parental leave policy?");

    expect(result.answer).toBe(NOT_FOUND_MESSAGE);
    expect(result.sources).toEqual([]);
  });

  it("shows only the documents the answer actually cites, with pages and excerpts", async () => {
    vi.mocked(retrieveRelevantChunks).mockResolvedValue([
      { chunkId: "c1", documentId: "d1", documentName: "Leave.pdf", content: "Annual Leave: 24 days per year.", similarity: 0.85, page: 2 },
      { chunkId: "c2", documentId: "d2", documentName: "Travel.pdf", content: "Per diem is $50.", similarity: 0.7 },
    ]);
    vi.mocked(getChatProvider).mockReturnValue({
      name: "ollama",
      model: "llama3.2",
      complete: vi.fn().mockResolvedValue({
        content: "Employees receive 24 days of annual leave per year [1]. See also [7].",
        model: "llama3.2",
        latencyMs: 40,
      }),
    });

    const result = await answerQuestion("org-1", "How many annual leave days?");

    expect(result.answer).toBe("Employees receive 24 days of annual leave per year [1]. See also.");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ ref: 1, documentName: "Leave.pdf", pages: [2] });
    expect(result.sources[0]!.excerpt).toContain("24 days");
  });
});
