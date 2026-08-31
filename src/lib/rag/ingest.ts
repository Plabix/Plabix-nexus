import { query, withTransaction } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/ai/provider";
import { extractText, isSupportedFileType, ExtractionError } from "./extraction";
import { chunkText } from "./chunking";
import { logAIUsage } from "@/lib/observability/logger";
import { readFile } from "node:fs/promises";

/**
 * Processes a single pending document end-to-end:
 * extract -> clean -> chunk -> embed -> store.
 * Designed to be called synchronously right after upload for simplicity;
 * swap for a queue/worker later without changing this function's contract.
 */
export async function processDocument(documentId: string): Promise<void> {
  const doc = await query<{
    id: string;
    organization_id: string;
    storage_path: string;
    file_type: string;
  }>("SELECT id, organization_id, storage_path, file_type FROM documents WHERE id = $1", [
    documentId,
  ]);
  const document = doc[0];
  if (!document) throw new Error(`Document ${documentId} not found`);

  await query(
    "UPDATE documents SET status = 'processing', processing_started_at = now() WHERE id = $1",
    [documentId]
  );

  try {
    if (!isSupportedFileType(document.file_type)) {
      throw new ExtractionError(`Unsupported file type: ${document.file_type}`);
    }

    const buffer = await readFile(document.storage_path);

    const extractStart = Date.now();
    const text = await extractText(buffer, document.file_type);
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "extraction",
      durationMs: Date.now() - extractStart,
      success: true,
    });

    const chunkStart = Date.now();
    const chunks = chunkText(text);
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "chunking",
      durationMs: Date.now() - chunkStart,
      success: true,
    });

    if (chunks.length === 0) {
      throw new ExtractionError("Document contains no extractable text.");
    }

    const embeddingProvider = getEmbeddingProvider();
    const embedStart = Date.now();
    const embeddings = await embeddingProvider.embedBatch(chunks.map((c) => c.content));
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "embedding",
      provider: embeddingProvider.name,
      durationMs: Date.now() - embedStart,
      success: true,
    });

    await withTransaction(async (client) => {
      await client.query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const emb = embeddings[i];
        if (!chunk || !emb) continue;
        await client.query(
          `INSERT INTO document_chunks
             (document_id, organization_id, chunk_index, content, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            documentId,
            document.organization_id,
            chunk.index,
            chunk.content,
            `[${emb.embedding.join(",")}]`,
            JSON.stringify({ model: emb.model }),
          ]
        );
      }
      await client.query(
        `UPDATE documents
         SET status = 'ready', chunk_count = $2, processing_completed_at = now(), error_message = NULL
         WHERE id = $1`,
        [documentId, chunks.length]
      );
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during document processing.";
    await query(
      `UPDATE documents
       SET status = 'failed', error_message = $2, processing_completed_at = now()
       WHERE id = $1`,
      [documentId, message]
    );
    await logAIUsage({
      organizationId: document.organization_id,
      eventType: "extraction",
      success: false,
      errorMessage: message,
    });
    throw err;
  }
}
