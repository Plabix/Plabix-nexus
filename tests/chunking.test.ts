import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/rag/chunking";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Hello world.", { chunkSize: 1000, overlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Hello world.");
  });

  it("splits long text into multiple chunks", () => {
    const paragraph = "A".repeat(50);
    const text = Array(10).fill(paragraph).join("\n\n");
    const chunks = chunkText(text, { chunkSize: 120, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(140);
    }
  });

  it("hard-splits a single paragraph longer than chunkSize", () => {
    const text = "B".repeat(500);
    const chunks = chunkText(text, { chunkSize: 100, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("assigns sequential indices", () => {
    const text = "para one\n\npara two\n\npara three";
    const chunks = chunkText(text, { chunkSize: 10, overlap: 2 });
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("throws on invalid overlap", () => {
    expect(() => chunkText("hi", { chunkSize: 10, overlap: 10 })).toThrow();
  });
});
