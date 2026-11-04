export class ExtractionError extends Error {}

/** A contiguous piece of a document. `page` is set for paginated formats (PDF). */
export interface DocumentSection {
  text: string;
  page?: number;
}

type Extractor = (buffer: Buffer) => Promise<DocumentSection[]>;

/** Upper bound on pages read from one PDF, so a hostile file can't stall ingestion. */
const MAX_PDF_PAGES = Number(process.env.UPLOAD_MAX_PDF_PAGES || 2000);

async function extractPdf(buffer: Buffer): Promise<DocumentSection[]> {
  // Mozilla pdf.js, legacy build (Node-compatible). Text extraction needs no canvas.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    // pdf.js takes ownership of the array it is given; pass a copy.
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  const pages: DocumentSection[] = [];
  try {
    const doc = await loadingTask.promise;
    if (doc.numPages > MAX_PDF_PAGES) {
      throw new ExtractionError(`PDF has ${doc.numPages} pages; the limit is ${MAX_PDF_PAGES}.`);
    }
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue; // marked-content markers carry no text
        text += item.str;
        if (item.hasEOL) text += "\n";
      }
      pages.push({ text, page: pageNumber });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

const extractors: Record<string, Extractor> = {
  "application/pdf": extractPdf,
  "text/plain": async (buffer) => [{ text: buffer.toString("utf-8") }],
  "text/markdown": async (buffer) => [{ text: buffer.toString("utf-8") }],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": async (buffer) => {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return [{ text: result.value }];
  },
};

/** Adds support for a new file type without touching call sites. */
export function registerExtractor(mimeType: string, extractor: Extractor) {
  extractors[mimeType] = extractor;
}

export function isSupportedFileType(mimeType: string): boolean {
  return mimeType in extractors;
}

/** Extracts and cleans text, keeping page boundaries where the format has them. */
export async function extractSections(buffer: Buffer, mimeType: string): Promise<DocumentSection[]> {
  const extractor = extractors[mimeType];
  if (!extractor) {
    throw new ExtractionError(`Unsupported file type: ${mimeType}`);
  }
  let raw: DocumentSection[];
  try {
    raw = await extractor(buffer);
  } catch (err) {
    throw new ExtractionError(
      `Unable to extract usable text from this document. ${
        err instanceof Error ? err.message : ""
      }`.trim()
    );
  }
  const sections = raw
    .map((s) => ({ ...s, text: cleanText(s.text) }))
    .filter((s) => s.text.length > 0);
  if (sections.length === 0) {
    throw new ExtractionError(
      mimeType === "application/pdf"
        ? "This PDF contains no extractable text. Scanned (image-only) PDFs need OCR first."
        : "Document contains no extractable text."
    );
  }
  return sections;
}

/** Extracts the document's full text as a single string. */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const sections = await extractSections(buffer, mimeType);
  return sections.map((s) => s.text).join("\n\n");
}

/** Normalizes whitespace and strips control characters picked up from PDFs. */
export function cleanText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
