import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";

export const GET = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as { params: { id: string } };
  const { organizationId, userId } = await requireAuth();

  const conversation = await queryOne(
    "SELECT id, title, created_at FROM conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
    [params.id, organizationId, userId]
  );
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const messages = await query(
    `SELECT id, role, content, sources, latency_ms, created_at
     FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [params.id]
  );

  return NextResponse.json({ conversation, messages });
});

export const DELETE = withErrorHandling(async (_req, ctx) => {
  const { params } = ctx as { params: { id: string } };
  const { organizationId, userId } = await requireAuth();

  const conversation = await queryOne(
    "SELECT id FROM conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
    [params.id, organizationId, userId]
  );
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  await query("DELETE FROM conversations WHERE id = $1", [params.id]);
  return NextResponse.json({ success: true });
});
