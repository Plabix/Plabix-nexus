-- Plabix Nexus — reliability & retrieval upgrades
-- Additive only: no data is removed. Safe to re-run.

-- ── Vector index: IVFFlat -> HNSW ───────────────────────────────────────────
-- The IVFFlat index from 001 was built on an empty table with lists=100.
-- IVFFlat centroids are computed at build time, so an index built before any
-- data exists clusters poorly, and with the default probes=1 small knowledge
-- bases can get zero rows back. HNSW needs no training data and gives good
-- recall at every size, so it suits a per-tenant knowledge base.
DROP INDEX IF EXISTS idx_chunks_embedding;
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- ── Full-text search column for hybrid (vector + keyword) retrieval ─────────
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_chunks_content_tsv ON document_chunks USING gin (content_tsv);

-- One row per (document, chunk position).
CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_document_index
  ON document_chunks (document_id, chunk_index);

-- ── Documents: duplicate detection + processing bookkeeping ────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_sha256 TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_documents_org_hash ON documents (organization_id, content_sha256);
CREATE INDEX IF NOT EXISTS idx_documents_org_created ON documents (organization_id, created_at DESC);

-- ── Query-path indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_org_user_updated
  ON conversations (organization_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_org_created
  ON ai_usage_events (organization_id, created_at DESC);

-- ── Keep updated_at honest ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations', 'users', 'documents', 'conversations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
