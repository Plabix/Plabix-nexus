import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db/pool";
import { parseId, requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { enqueueDocument } from "@/lib/rag/queue";

/** Re-queues a failed document, or one that is stuck in 'pending'. */
export const POST = withErrorHandling<{ id: string }>(async (_req, params) => {
  const id = parseId(params.id);
  const { organizationId } = await requireAuth();

  const document = await queryOne<{ id: string; status: string }>(
    `UPDATE documents SET status = 'pending', error_message = NULL
     WHERE id = $1 AND organization_id = $2 AND status IN ('failed', 'pending')
     RETURNING id, status`,
    [id, organizationId]
  );

  if (!document) {
    const exists = await queryOne(
      "SELECT 1 FROM documents WHERE id = $1 AND organization_id = $2",
      [id, organizationId]
    );
    return exists
      ? NextResponse.json(
          { error: "Only failed or pending documents can be retried." },
          { status: 400 }
        )
      : NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  enqueueDocument(document.id);
  return NextResponse.json({ success: true, status: "pending" }, { status: 202 });
});
