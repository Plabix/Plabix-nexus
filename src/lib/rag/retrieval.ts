import { withTransaction } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/ai/provider";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  similarity: number;
  chunkIndex?: number;
  page?: number;
}

interface CandidateRow {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  chunk_index: number;
  metadata: { page?: number } | null;
  similarity: number;
  vector_rank: string | null;
  keyword_rank: string | null;
}

export interface RetrievalOptions {
  topK?: number;
  threshold?: number;
}

/** Standard Reciprocal Rank Fusion constant. */
const RRF_K = 60;

export function retrievalSettings(options: RetrievalOptions = {}) {
  const topK = options.topK ?? Number(process.env.RAG_TOP_K || 5);
  const threshold = options.threshold ?? Number(process.env.RAG_SIMILARITY_THRESHOLD || 0.6);
  // Keyword matches get a lower semantic bar, but never an unrelated chunk.
  const keywordFloor = Number(process.env.RAG_KEYWORD_SIMILARITY_FLOOR || threshold - 0.1);
  return { topK, threshold, keywordFloor, candidates: Math.max(topK * 4, 20) };
}

/**
 * Fuses vector and keyword candidates, applies relevance thresholds and
 * returns the best `topK`. Pure, so the ranking policy is unit-testable.
 */
export function rankCandidates(
  rows: CandidateRow[],
  settings: { topK: number; threshold: number; keywordFloor: number }
): RetrievedChunk[] {
  return rows
    .filter((r) => {
      const similarity = Number(r.similarity);
      return similarity >= settings.threshold || (r.keyword_rank !== null && similarity >= settings.keywordFloor);
    })
    .map((r) => {
      const vectorScore = r.vector_rank ? 1 / (RRF_K + Number(r.vector_rank)) : 0;
      const keywordScore = r.keyword_rank ? 1 / (RRF_K + Number(r.keyword_rank)) : 0;
      return { row: r, score: vectorScore + keywordScore };
    })
    .sort((a, b) => b.score - a.score || Number(b.row.similarity) - Number(a.row.similarity))
    .slice(0, settings.topK)
    .map(({ row }) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentName: row.document_name,
      content: row.content,
      similarity: Number(row.similarity),
      chunkIndex: row.chunk_index,
      page: row.metadata?.page,
    }));
}

/**
 * Retrieves the most relevant chunks for a question, scoped strictly to a
 * single organization_id. This scoping is the tenant-isolation boundary —
 * every retrieval query MUST filter by organization_id (both legs below do,
 * and the final join re-checks the document's organization).
 */
export async function retrieveRelevantChunks(
  organizationId: string,
  questionText: string,
  options: RetrievalOptions = {}
): Promise<RetrievedChunk[]> {
  const settings = retrievalSettings(options);

  const embeddingProvider = getEmbeddingProvider();
  const { embedding } = await embeddingProvider.embed(questionText, "query");
  const vectorLiteral = `[${embedding.join(",")}]`;

  const rows = await withTransaction(async (client) => {
    // pgvector >= 0.8: keep scanning the HNSW graph until enough rows pass
    // the organization filter, instead of returning a short list.
    await client.query("SET LOCAL hnsw.iterative_scan = relaxed_order");
    await client.query("SET LOCAL hnsw.ef_search = 100");
    const result = await client.query<CandidateRow>(
      `WITH vector_hits AS (
         SELECT id, row_number() OVER (ORDER BY distance) AS rank
         FROM (
           SELECT dc.id, dc.embedding <=> $1::vector AS distance
           FROM document_chunks dc
           WHERE dc.organization_id = $2 AND dc.embedding IS NOT NULL
           ORDER BY dc.embedding <=> $1::vector
           LIMIT $4
         ) v
       ),
       keyword_hits AS (
         SELECT id, row_number() OVER (ORDER BY score DESC) AS rank
         FROM (
           SELECT dc.id, ts_rank_cd(dc.content_tsv, q) AS score
           FROM document_chunks dc, websearch_to_tsquery('english', $3) q
           WHERE dc.organization_id = $2 AND dc.content_tsv @@ q
           ORDER BY score DESC
           LIMIT $4
         ) k
       ),
       candidates AS (
         SELECT id FROM vector_hits UNION SELECT id FROM keyword_hits
       )
       SELECT
         dc.id AS chunk_id,
         dc.document_id,
         d.file_name AS document_name,
         dc.content,
         dc.chunk_index,
         dc.metadata,
         1 - (dc.embedding <=> $1::vector) AS similarity,
         vh.rank AS vector_rank,
         kh.rank AS keyword_rank
       FROM candidates c
       JOIN document_chunks dc ON dc.id = c.id
       JOIN documents d ON d.id = dc.document_id
       LEFT JOIN vector_hits vh ON vh.id = c.id
       LEFT JOIN keyword_hits kh ON kh.id = c.id
       WHERE d.organization_id = $2 AND d.status = 'ready'`,
      [vectorLiteral, organizationId, questionText, settings.candidates]
    );
    return result.rows;
  });

  return rankCandidates(rows, settings);
}
