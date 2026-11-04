import { describe, it, expect } from "vitest";
import { validateUpload, cleanDisplayName, FileValidationError, MIME } from "@/lib/files";
import { makePdf } from "./helpers/pdf";

describe("validateUpload", () => {
  it("detects Markdown by extension even when the browser sends no MIME type", () => {
    const result = validateUpload("handbook.md", Buffer.from("# Handbook\n\nHello"));
    expect(result.mimeType).toBe(MIME.md);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a real PDF", () => {
    expect(validateUpload("policy.PDF", makePdf([["Hello"]])).mimeType).toBe(MIME.pdf);
  });

  it("rejects a text file renamed to .pdf", () => {
    expect(() => validateUpload("fake.pdf", Buffer.from("not a pdf"))).toThrow(FileValidationError);
  });

  it("rejects a non-ZIP file renamed to .docx", () => {
    expect(() => validateUpload("fake.docx", Buffer.from("plain text"))).toThrow(FileValidationError);
  });

  it("rejects binary content in a .txt file", () => {
    expect(() => validateUpload("bin.txt", Buffer.from([0x00, 0x01, 0x02, 0xff]))).toThrow(
      FileValidationError
    );
  });

  it("rejects unsupported extensions", () => {
    expect(() => validateUpload("malware.exe", Buffer.from("MZ"))).toThrow(/Unsupported file type/);
  });

  it("rejects empty files", () => {
    expect(() => validateUpload("empty.txt", Buffer.alloc(0))).toThrow(/empty/);
  });

  it("accepts UTF-8 text cut in the middle of a multi-byte character at the sample edge", () => {
    const text = "a".repeat(8191) + "é"; // é is 2 bytes; byte 8192 is mid-character
    expect(validateUpload("notes.txt", Buffer.from(text)).mimeType).toBe(MIME.txt);
  });
});

describe("cleanDisplayName", () => {
  it("strips directory components and control characters", () => {
    expect(cleanDisplayName("..\\..\\windows\\evil\u0000.txt")).toBe("evil.txt");
    expect(cleanDisplayName("../../etc/passwd")).toBe("passwd");
  });

  it("falls back to a default name", () => {
    expect(cleanDisplayName("")).toBe("document");
  });
});
