import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./storage/documents";

/** Saves a buffer to local disk under a per-organization folder. Returns the path. */
export async function saveDocumentFile(
  organizationId: string,
  originalFileName: string,
  buffer: Buffer
): Promise<string> {
  const orgDir = path.join(UPLOAD_DIR, organizationId);
  await mkdir(orgDir, { recursive: true });
  const safeName = `${randomUUID()}-${sanitizeFileName(originalFileName)}`;
  const fullPath = path.join(orgDir, safeName);
  await writeFile(fullPath, buffer);
  return fullPath;
}

export async function deleteDocumentFile(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath);
  } catch {
    // File may already be gone; deletion should still succeed logically.
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}
