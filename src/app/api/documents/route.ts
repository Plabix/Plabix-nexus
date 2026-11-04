import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { HttpError, requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { MAX_FILE_SIZE_BYTES } from "@/lib/validation";
import { FileValidationError, validateUpload } from "@/lib/files";
import { getStorage } from "@/lib/storage";
import { enqueueDocument } from "@/lib/rag/queue";
import { rateLimit } from "@/lib/security/rate-limit";

const DOCUMENT_COLUMNS = `d.id, d.file_name, d.file_type, d.file_size_bytes, d.status, d.error_message,
  d.chunk_count, d.created_at, d.updated_at, d.processing_started_at, d.processing_completed_at,
  u.full_name AS uploaded_by_name, u.email AS uploaded_by_email`;

export const GET = withErrorHandling(async (req) => {
  const { organizationId } = await requireAuth();
  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  const status = url.searchParams.get("status");
  const validStatus = ["pending", "processing", "ready", "failed"].includes(status ?? "")
    ? status
    : null;

  const documents = await query(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.organization_id = $1
       AND ($2 = '' OR d.file_name ILIKE '%' || $2 || '%')
       AND ($3::document_status IS NULL OR d.status = $3::document_status)
     ORDER BY d.created_at DESC
     LIMIT 500`,
    [organizationId, search.replace(/[\\%_]/g, (c) => `\\${c}`), validStatus]
  );
  return NextResponse.json({ documents });
});

export const POST = withErrorHandling(async (req) => {
  const { userId, organizationId } = await requireAuth();

  if (!rateLimit(`upload:${userId}`, 60, 60 * 60 * 1000).allowed) {
    throw new HttpError("Upload limit reached. Please try again later.", 429);
  }

  // Reject oversized bodies before buffering them into memory.
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_FILE_SIZE_BYTES + 1024 * 1024) {
    throw new FileValidationError(
      `File exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB limit.`,
      413
    );
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new FileValidationError(
      `File exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB limit.`,
      413
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validated = validateUpload(file.name, buffer);

  const duplicate = await queryOne<{ id: string; file_name: string }>(
    `SELECT id, file_name FROM documents
     WHERE organization_id = $1 AND content_sha256 = $2 AND status <> 'failed'
     LIMIT 1`,
    [organizationId, validated.sha256]
  );
  if (duplicate) {
    return NextResponse.json(
      {
        error: `This file is already in your knowledge base as "${duplicate.file_name}".`,
        documentId: duplicate.id,
      },
      { status: 409 }
    );
  }

  const storage = getStorage();
  const storageKey = await storage.save(organizationId, validated.fileName, buffer);

  let documentId: string;
  try {
    const created = await queryOne<{ id: string }>(
      `INSERT INTO documents
         (organization_id, uploaded_by, file_name, file_type, file_size_bytes, storage_path,
          status, content_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [
        organizationId,
        userId,
        validated.fileName,
        validated.mimeType,
        buffer.length,
        storageKey,
        validated.sha256,
      ]
    );
    documentId = created!.id;
  } catch (err) {
    await storage.delete(storageKey);
    throw err;
  }

  // Processing runs on the background queue; the UI polls document status.
  enqueueDocument(documentId);

  return NextResponse.json({ documentId, status: "pending" }, { status: 202 });
});
