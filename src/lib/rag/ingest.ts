import { query, queryOne, withTransaction } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/ai/provider";
import { getStorage } from "@/lib/storage";
import { extractSections, isSupportedFileType, ExtractionError } from "./extraction";
import { chunkSections } from "./chunking";
import { logAIUsage } from "@/lib/observability/logger";

/** Chunks inserted per INSERT statement. */
const INSERT_BATCH = 50;

/** Text actually embedded for a chunk: the file name adds useful topical signal. */
export function embeddingInput(fileName: string, content: string): string {
  return `${fileName}\n\n${content}`;
}

/**
 * Processes a single pending document end-to-end:
 * extract -> clean -> chunk -> embed -> store.
 *
 * The document is claimed with a conditional UPDATE, so concurrent callers
 * (upload, retry, startup recovery) can never process the same document twice.
 * Returns false when the document was not in a claimable state.
 */
export async function processDocument(documentId: string): Promise<boolean> {
  const document = await queryOne<{
    id: string;
    organization_id: string;
    storage_path: string;
    file_type: string;
    file_name: string;
  }>(
    `UPDATE documents
       SET status = 'processing', processing_started_at = now(), error_message = NULL,
           processing_attempts = processing_attempts + 1
     WHERE id = $1 AND status = 'pending'
     RETURNING id, organization_id, storage_path, file_type, file_name`,
    [documentId]
  );
  if (!document) return false;

  let stage: "extraction" | "chunking" | "embedding" = "extraction";
  try {
    if (!isSupportedFileType(document.file_type)) {
      throw new ExtractionError(`Unsupported file type: ${document.file_type}`);
    }

    let buffer: Buffer;
    try {
      buffer = await getStorage().read(document.storage_path);
    } catch {
      throw new ExtractionError("The uploaded file could not be found in storage.");
    }

    const extractStart = Date.now();
    const sections = await extractSections(buffer, document.file_type);
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "extraction",
      provider: "local",
      durationMs: Date.now() - extractStart,
      success: true,
    });

    stage = "chunking";
    const chunkStart = Date.now();
    const chunks = chunkSections(sections);
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "chunking",
      provider: "local",
      durationMs: Date.now() - chunkStart,
      success: true,
    });
    if (chunks.length === 0) {
      throw new ExtractionError("Document contains no extractable text.");
    }

    stage = "embedding";
    const embeddingProvider = getEmbeddingProvider();
    const embedStart = Date.now();
    const embeddings = await embeddingProvider.embedBatch(
      chunks.map((c) => embeddingInput(document.file_name, c.content)),
      "document"
    );
    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count does not match chunk count.");
    }
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "embedding",
      provider: embeddingProvider.name,
      model: embeddingProvider.model,
      durationMs: Date.now() - embedStart,
      success: true,
    });

    await withTransaction(async (client) => {
      await client.query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);
      for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
        const params: unknown[] = [];
        const rows: string[] = [];
        chunks.slice(start, start + INSERT_BATCH).forEach((chunk, offset) => {
          const emb = embeddings[start + offset]!;
          const p = params.length;
          rows.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}::vector, $${p + 6})`);
          params.push(
            documentId,
            document.organization_id,
            chunk.index,
            chunk.content,
            `[${emb.embedding.join(",")}]`,
            JSON.stringify({ model: emb.model, ...(chunk.page ? { page: chunk.page } : {}) })
          );
        });
        await client.query(
          `INSERT INTO document_chunks
             (document_id, organization_id, chunk_index, content, embedding, metadata)
           VALUES ${rows.join(", ")}`,
          params
        );
      }
      await client.query(
        `UPDATE documents
         SET status = 'ready', chunk_count = $2, processing_completed_at = now(), error_message = NULL
         WHERE id = $1`,
        [documentId, chunks.length]
      );
    });
    return true;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during document processing.";
    await query(
      `UPDATE documents
       SET status = 'failed', error_message = $2, processing_completed_at = now()
       WHERE id = $1`,
      [documentId, message.slice(0, 1000)]
    );
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: stage,
      provider: stage === "embedding" ? "ollama" : "local",
      success: false,
      errorMessage: message,
    });
    throw err;
  }
}
