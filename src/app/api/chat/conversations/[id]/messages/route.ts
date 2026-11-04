import { NextResponse } from "next/server";
import { query, queryOne, withTransaction } from "@/lib/db/pool";
import { HttpError, parseId, requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { askQuestionSchema, firstIssue } from "@/lib/validation";
import { answerQuestion } from "@/lib/rag/answer";
import type { ChatMessage } from "@/lib/ai/types";
import { rateLimit } from "@/lib/security/rate-limit";

export const POST = withErrorHandling<{ id: string }>(async (req, params) => {
  const conversationId = parseId(params.id);
  const { organizationId, userId } = await requireAuth();

  const conversation = await queryOne<{ id: string; title: string }>(
    "SELECT id, title FROM conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
    [conversationId, organizationId, userId]
  );
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Local generation is expensive; stop one user from monopolizing the model.
  const limit = rateLimit(`chat:${userId}`, 30, 60 * 1000);
  if (!limit.allowed) {
    throw new HttpError("You're sending questions too quickly. Please wait a moment.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = askQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }
  const { question } = parsed.data;

  const history = (
    await query<ChatMessage>(
      `SELECT role, content FROM (
         SELECT role::text AS role, content, created_at FROM messages
         WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 4
       ) recent ORDER BY created_at ASC`,
      [conversationId]
    )
  ).filter((m) => m.role === "user" || m.role === "assistant");

  // AI errors propagate to withErrorHandling (503) before anything is saved,
  // so a failed answer never leaves an orphaned question in the history.
  const result = await answerQuestion(organizationId, question, history);

  const { userMessage, assistantMessage } = await withTransaction(async (client) => {
    const user = await client.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING id, role, content, sources, latency_ms, created_at`,
      [conversationId, question]
    );
    const assistant = await client.query(
      `INSERT INTO messages (conversation_id, role, content, sources, latency_ms, created_at)
       VALUES ($1, 'assistant', $2, $3, $4, clock_timestamp())
       RETURNING id, role, content, sources, latency_ms, created_at`,
      [conversationId, result.answer, JSON.stringify(result.sources), result.latencyMs]
    );
    // Auto-title new conversations from the first question.
    await client.query(
      `UPDATE conversations
       SET title = CASE WHEN title = 'New conversation' THEN $2 ELSE title END
       WHERE id = $1`,
      [conversationId, question.slice(0, 80)]
    );
    return { userMessage: user.rows[0], assistantMessage: assistant.rows[0] };
  });

  return NextResponse.json({ userMessage, message: assistantMessage });
});
