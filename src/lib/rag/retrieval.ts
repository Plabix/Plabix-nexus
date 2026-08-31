import { query } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/ai/provider";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
}

/**
 * Retrieves the top-K most similar chunks for a question, scoped strictly
 * to a single organization_id. This scoping is the tenant-isolation
 * boundary — every retrieval query MUST filter by organization_id.
 */
export async function retrieveRelevantChunks(
  organizationId: string,
  questionText: string
): Promise<RetrievedChunk[]> {
  const topK = Number(process.env.RAG_TOP_K || 5);
  const threshold = Number(process.env.RAG_SIMILARITY_THRESHOLD || 0.5);

  const embeddingProvider = getEmbeddingProvider();
  const { embedding } = await embeddingProvider.embed(questionText);
  const vectorLiteral = `[${embedding.join(",")}]`;

  // cosine similarity = 1 - cosine distance (pgvector's <=> operator)
  const rows = await query<{
    chunk_id: string;
    document_id: string;
    document_name: string;
    content: string;
    similarity: number;
  }>(
    `SELECT
       dc.id AS chunk_id,
       dc.document_id,
       d.file_name AS document_name,
       dc.content,
       1 - (dc.embedding <=> $1::vector) AS similarity
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id
     WHERE dc.organization_id = $2
       AND d.status = 'ready'
     ORDER BY dc.embedding <=> $1::vector ASC
     LIMIT $3`,
    [vectorLiteral, organizationId, topK]
  );

  return rows
    .filter((r) => r.similarity >= threshold)
    .map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentName: r.document_name,
      content: r.content,
      similarity: r.similarity,
    }));
}
