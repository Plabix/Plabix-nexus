import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";

export const GET = withErrorHandling(async () => {
  const { organizationId } = await requireAuth();

  const [documentStats, chunkStats, conversationStats, recentDocuments, recentQuestions] =
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
      query(
        `SELECT id, file_name, status, created_at FROM documents
         WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [organizationId]
      ),
      query(
        `SELECT m.content, m.created_at FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.organization_id = $1 AND m.role = 'user'
         ORDER BY m.created_at DESC LIMIT 5`,
        [organizationId]
      ),
    ]);

  return NextResponse.json({
    documents: documentStats,
    chunks: chunkStats,
    conversations: conversationStats,
    recentDocuments,
    recentQuestions,
  });
});
