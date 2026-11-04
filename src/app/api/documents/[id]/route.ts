import { NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db/pool";
import { ForbiddenError, parseId, requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { getStorage } from "@/lib/storage";

export const GET = withErrorHandling<{ id: string }>(async (_req, params) => {
  const id = parseId(params.id);
  const { organizationId } = await requireAuth();

  const document = await queryOne(
    `SELECT id, file_name, file_type, file_size_bytes, status, error_message,
            chunk_count, created_at, updated_at
     FROM documents WHERE id = $1 AND organization_id = $2`,
    [id, organizationId]
  );

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  return NextResponse.json({ document });
});

export const DELETE = withErrorHandling<{ id: string }>(async (_req, params) => {
  const id = parseId(params.id);
  const { organizationId, userId, role } = await requireAuth();

  // Scoping by organization_id here is what prevents cross-tenant deletion.
  const document = await queryOne<{ storage_path: string; uploaded_by: string | null; status: string }>(
    "SELECT storage_path, uploaded_by, status FROM documents WHERE id = $1 AND organization_id = $2",
    [id, organizationId]
  );

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (role === "member" && document.uploaded_by !== userId) {
    throw new ForbiddenError("Only admins can delete documents uploaded by someone else.");
  }
  if (document.status === "processing") {
    return NextResponse.json(
      { error: "This document is being processed. Try again in a moment." },
      { status: 409 }
    );
  }

  await query("DELETE FROM documents WHERE id = $1 AND organization_id = $2", [
    id,
    organizationId,
  ]);
  await getStorage().delete(document.storage_path);

  return NextResponse.json({ success: true });
});
