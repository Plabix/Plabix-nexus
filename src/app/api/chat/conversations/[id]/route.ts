import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { parseId, requireAuth, withErrorHandling } from "@/lib/auth/guard";

export const GET = withErrorHandling<{ id: string }>(async (_req, params) => {
  const id = parseId(params.id);
  const { organizationId, userId } = await requireAuth();

  const conversation = await queryOne(
    "SELECT id, title, created_at FROM conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
    [id, organizationId, userId]
  );
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const messages = await query(
    `SELECT id, role, content, sources, latency_ms, created_at
     FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [id]
  );

  return NextResponse.json({ conversation, messages });
});

export const DELETE = withErrorHandling<{ id: string }>(async (_req, params) => {
  const id = parseId(params.id);
  const { organizationId, userId } = await requireAuth();

  const deleted = await queryOne(
    "DELETE FROM conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3 RETURNING id",
    [id, organizationId, userId]
  );
  if (!deleted) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
});
