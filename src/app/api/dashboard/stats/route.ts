import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";

export const GET = withErrorHandling(async () => {
  const { organizationId, userId } = await requireAuth();

  const [documentStats, chunkStats, conversationStats, questionStats, recentDocuments, recentQuestions] =
    await Promise.all([
      queryOne<{ total: string; ready: string; failed: string; processing: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'ready') AS ready,
           COUNT(*) FILTER (WHERE status = 'failed') AS failed,
           COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) AS processing
         FROM documents WHERE organization_id = $1`,
        [organizationId]
      ),
      queryOne<{ total: string }>(
        "SELECT COUNT(*) AS total FROM document_chunks WHERE organization_id = $1",
        [organizationId]
      ),
      queryOne<{ total: string }>(
        "SELECT COUNT(*) AS total FROM conversations WHERE organization_id = $1",
        [organizationId]
      ),
      queryOne<{ total: string; last_7_days: string; avg_latency_ms: number | null }>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE m.created_at > now() - interval '7 days') AS last_7_days,
                (SELECT AVG(latency_ms)::int FROM messages a
                   JOIN conversations ac ON ac.id = a.conversation_id
                  WHERE ac.organization_id = $1 AND a.role = 'assistant') AS avg_latency_ms
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.organization_id = $1 AND m.role = 'user'`,
        [organizationId]
      ),
      query(
        `SELECT id, file_name, status, created_at FROM documents
         WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [organizationId]
      ),
      // Only the viewer's own questions: other members' chats are private.
      query(
        `SELECT m.content, m.created_at, c.id AS conversation_id FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.organization_id = $1 AND c.user_id = $2 AND m.role = 'user'
         ORDER BY m.created_at DESC LIMIT 5`,
        [organizationId, userId]
      ),
    ]);

  return NextResponse.json({
    documents: documentStats,
    chunks: chunkStats,
    conversations: conversationStats,
    questions: questionStats,
    recentDocuments,
    recentQuestions,
  });
});
