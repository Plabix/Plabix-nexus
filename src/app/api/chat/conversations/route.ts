import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { createConversationSchema } from "@/lib/validation";

export const GET = withErrorHandling(async () => {
  const { organizationId, userId } = await requireAuth();
  const conversations = await query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id)::int AS message_count
     FROM conversations c
     WHERE c.organization_id = $1 AND c.user_id = $2
     ORDER BY c.updated_at DESC
     LIMIT 200`,
    [organizationId, userId]
  );
  return NextResponse.json({ conversations });
});

export const POST = withErrorHandling(async (req) => {
  const { organizationId, userId } = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const conversation = await queryOne<{ id: string; title: string; created_at: string }>(
    `INSERT INTO conversations (organization_id, user_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, title, created_at`,
    [organizationId, userId, parsed.data.title || "New conversation"]
  );

  return NextResponse.json({ conversation }, { status: 201 });
});
