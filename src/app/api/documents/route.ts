import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/validation";
import { saveDocumentFile } from "@/lib/storage/local";
import { processDocument } from "@/lib/rag/ingest";

export const GET = withErrorHandling(async () => {
  const { organizationId } = await requireAuth();
  const documents = await query(
    `SELECT id, file_name, file_type, file_size_bytes, status, error_message,
            chunk_count, created_at, updated_at
     FROM documents
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );
  return NextResponse.json({ documents });
});

export const POST = withErrorHandling(async (req) => {
  const { userId, organizationId } = await requireAuth();

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the maximum allowed size.` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveDocumentFile(organizationId, file.name, buffer);

  const created = await queryOne<{ id: string }>(
    `INSERT INTO documents
       (organization_id, uploaded_by, file_name, file_type, file_size_bytes, storage_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [organizationId, userId, file.name, file.type, file.size, storagePath]
  );

  const documentId = created!.id;

  // Fire-and-forget processing so the upload responds quickly; status is
  // polled/refreshed by the UI. Errors are captured onto the document row.
  processDocument(documentId).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`Processing failed for document ${documentId}:`, err);
  });

  return NextResponse.json({ documentId, status: "pending" }, { status: 202 });
});
