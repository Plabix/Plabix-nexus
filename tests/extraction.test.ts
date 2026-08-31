import { describe, it, expect } from "vitest";
import { cleanText, extractText, isSupportedFileType, ExtractionError } from "@/lib/rag/extraction";

describe("cleanText", () => {
  it("normalizes CRLF and collapses excess blank lines", () => {
    const input = "Line one\r\n\r\n\r\nLine two\r\n";
    expect(cleanText(input)).toBe("Line one\n\nLine two");
  });

  it("strips control characters", () => {
    const input = "Hello\u0000World\u000bTest";
    expect(cleanText(input)).toBe("HelloWorldTest");
  });
});

describe("isSupportedFileType", () => {
  it("recognizes supported types", () => {
    expect(isSupportedFileType("application/pdf")).toBe(true);
    expect(isSupportedFileType("text/plain")).toBe(true);
    expect(isSupportedFileType("text/markdown")).toBe(true);
  });

  it("rejects unsupported types", () => {
    expect(isSupportedFileType("image/png")).toBe(false);
  });
});

describe("extractText", () => {
  it("extracts plain text directly", async () => {
    const buffer = Buffer.from("Annual Leave: 24 days per year.", "utf-8");
    const text = await extractText(buffer, "text/plain");
    expect(text).toContain("Annual Leave: 24 days per year.");
  });

  it("throws ExtractionError for empty text files", async () => {
    const buffer = Buffer.from("   \n\n  ", "utf-8");
    await expect(extractText(buffer, "text/plain")).rejects.toThrow(ExtractionError);
  });

  it("throws ExtractionError for unsupported types", async () => {
    const buffer = Buffer.from("data", "utf-8");
    await expect(extractText(buffer, "image/png")).rejects.toThrow(ExtractionError);
  });
});
