export class ExtractionError extends Error {}

type Extractor = (buffer: Buffer) => Promise<string>;

const extractors: Record<string, Extractor> = {
  "application/pdf": async (buffer) => {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  },
  "text/plain": async (buffer) => buffer.toString("utf-8"),
  "text/markdown": async (buffer) => buffer.toString("utf-8"),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": async (
    buffer
  ) => {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  },
};

/** Adds support for a new file type without touching call sites. */
export function registerExtractor(mimeType: string, extractor: Extractor) {
  extractors[mimeType] = extractor;
}

export function isSupportedFileType(mimeType: string): boolean {
  return mimeType in extractors;
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const extractor = extractors[mimeType];
  if (!extractor) {
    throw new ExtractionError(`Unsupported file type: ${mimeType}`);
  }
  let raw: string;
  try {
    raw = await extractor(buffer);
  } catch (err) {
    throw new ExtractionError(
      `Unable to extract usable text from this document. ${
        err instanceof Error ? err.message : ""
      }`.trim()
    );
  }
  const cleaned = cleanText(raw);
  if (cleaned.length === 0) {
    throw new ExtractionError("Document contains no extractable text.");
  }
  return cleaned;
}

/** Normalizes whitespace and strips control characters picked up from PDFs. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
