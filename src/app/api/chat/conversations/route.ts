import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { createConversationSchema } from "@/lib/validation";

export const GET = withErrorHandling(async () => {
  const { organizationId, userId } = await requireAuth();
  const conversations = await query(
    `SELECT id, title, created_at, updated_at
     FROM conversations
     WHERE organization_id = $1 AND user_id = $2
     ORDER BY updated_at DESC`,
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
