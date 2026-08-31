import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";
import { askQuestionSchema } from "@/lib/validation";
import { answerQuestion } from "@/lib/rag/answer";
import { AIProviderError } from "@/lib/ai/types";

export const POST = withErrorHandling(async (req, ctx) => {
  const { params } = ctx as { params: { id: string } };
  const { organizationId, userId } = await requireAuth();

  const conversation = await queryOne(
    "SELECT id, title FROM conversations WHERE id = $1 AND organization_id = $2 AND user_id = $3",
    [params.id, organizationId, userId]
  );
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = askQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const { question } = parsed.data;

  await query(
    "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)",
    [params.id, question]
  );

  try {
    const result = await answerQuestion(organizationId, question);

    const assistantMessage = await queryOne(
      `INSERT INTO messages (conversation_id, role, content, sources, latency_ms)
       VALUES ($1, 'assistant', $2, $3, $4)
       RETURNING id, role, content, sources, latency_ms, created_at`,
      [params.id, result.answer, JSON.stringify(result.sources), result.latencyMs]
    );

    // Auto-title new conversations from the first question.
    const conv = conversation as { title: string };
    if (conv.title === "New conversation") {
      const title = question.slice(0, 80);
      await query("UPDATE conversations SET title = $1, updated_at = now() WHERE id = $2", [
        title,
        params.id,
      ]);
    } else {
      await query("UPDATE conversations SET updated_at = now() WHERE id = $1", [params.id]);
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (err) {
    if (err instanceof AIProviderError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
});
