import { NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { processDocument } from "@/lib/rag/ingest";

export const POST = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as { params: { id: string } };
  const { organizationId } = await requireAuth();

  const document = await queryOne<{ id: string; status: string }>(
    "SELECT id, status FROM documents WHERE id = $1 AND organization_id = $2",
    [params.id, organizationId]
  );

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (document.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed documents can be retried." },
      { status: 400 }
    );
  }

  await query("UPDATE documents SET status = 'pending', error_message = NULL WHERE id = $1", [
    document.id,
  ]);

  processDocument(document.id).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`Retry processing failed for document ${document.id}:`, err);
  });

  return NextResponse.json({ success: true, status: "pending" }, { status: 202 });
});
