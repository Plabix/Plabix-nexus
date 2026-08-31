import { NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { deleteDocumentFile } from "@/lib/storage/local";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as { params: { id: string } };
  const { organizationId } = await requireAuth();

  const document = await queryOne(
    `SELECT id, file_name, file_type, file_size_bytes, status, error_message,
            chunk_count, created_at, updated_at
     FROM documents WHERE id = $1 AND organization_id = $2`,
    [params.id, organizationId]
  );

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  return NextResponse.json({ document });
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as { params: { id: string } };
  const { organizationId } = await requireAuth();

  // Scoping by organization_id here is what prevents cross-tenant deletion.
  const document = await queryOne<{ storage_path: string }>(
    "SELECT storage_path FROM documents WHERE id = $1 AND organization_id = $2",
    [params.id, organizationId]
  );

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await query("DELETE FROM documents WHERE id = $1 AND organization_id = $2", [
    params.id,
    organizationId,
  ]);
  await deleteDocumentFile(document.storage_path);

  return NextResponse.json({ success: true });
});
