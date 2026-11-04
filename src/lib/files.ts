import { createHash } from "node:crypto";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/validation";

export const MIME = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": MIME.pdf,
  ".txt": MIME.txt,
  ".text": MIME.txt,
  ".md": MIME.md,
  ".markdown": MIME.md,
  ".docx": MIME.docx,
};

export class FileValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export interface ValidatedFile {
  fileName: string;
  mimeType: string;
  sha256: string;
}

function extensionOf(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match ? match[0] : "";
}

/** Strips any directory components and control characters from a client-supplied name. */
export function cleanDisplayName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  return cleaned || "document";
}

function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) return false;
  // Reject bytes that are not valid UTF-8 (binary files renamed to .txt).
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, trimPartialUtf8(sample)));
    return true;
  } catch {
    return false;
  }
}

/** Length of `sample` excluding a trailing, truncated multi-byte UTF-8 sequence. */
function trimPartialUtf8(sample: Buffer): number {
  let end = sample.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const byte = sample[end - i]!;
    if ((byte & 0xc0) === 0x80) continue; // continuation byte
    if (byte >= 0xc0) {
      const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
      if (i < needed) end -= i;
    }
    break;
  }
  return end;
}

/** Checks the file's actual bytes match the format its extension claims. */
function matchesSignature(mimeType: string, buffer: Buffer): boolean {
  switch (mimeType) {
    case MIME.pdf:
      return buffer.subarray(0, 1024).includes("%PDF-");
    case MIME.docx:
      // DOCX is a ZIP archive that contains word/document.xml.
      return (
        buffer.length > 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04 &&
        buffer.includes("word/")
      );
    case MIME.txt:
    case MIME.md:
      return looksLikeText(buffer);
    default:
      return false;
  }
}

/**
 * Validates an upload by extension, size and content signature. The browser's
 * reported MIME type is ignored: it is client-controlled and often empty for
 * Markdown on Windows.
 */
export function validateUpload(fileName: string, buffer: Buffer): ValidatedFile {
  const displayName = cleanDisplayName(fileName);
  const mimeType = EXTENSION_TO_MIME[extensionOf(displayName)];

  if (!mimeType || !ALLOWED_FILE_TYPES.includes(mimeType)) {
    throw new FileValidationError(
      "Unsupported file type. Upload a PDF, DOCX, TXT or Markdown (.md) file."
    );
  }
  if (buffer.length === 0) throw new FileValidationError("The file is empty.");
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError(
      `File exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB limit.`,
      413
    );
  }
  if (!matchesSignature(mimeType, buffer)) {
    throw new FileValidationError(
      "The file's contents don't match its extension. It may be corrupted or renamed."
    );
  }

  return {
    fileName: displayName,
    mimeType,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
