# Plabix Nexus

> Your company's AI knowledge operating system: 100% local AI, $0 API cost.

Plabix Nexus lets a business upload internal documents (PDF, DOCX, TXT,
Markdown) and ask questions about them in plain language. Answers are
grounded strictly in the retrieved document content, with numbered
citations (including PDF page numbers). Everything runs on a local Ollama
model, so there are no API bills.

This is the first product in the Plabix ecosystem. It's built as a reusable
foundation (a provider-abstracted AI layer and a multi-tenant data model) for
future Plabix products.

---

## Stack

| Layer      | Choice                                                        |
|------------|---------------------------------------------------------------|
| Frontend   | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind    |
| Backend    | Next.js route handlers + in-process background ingestion worker |
| Database   | PostgreSQL 16 + pgvector (HNSW index + full-text search)      |
| AI (chat)  | Ollama, `llama3.2` (default)                                  |
| AI (embed) | Ollama, `nomic-embed-text` (768 dimensions)                   |
| Auth       | Session cookies + bcrypt, no external provider                |
| Infra      | Docker Compose (Postgres only)                                |

All tools are free and open source. No paid API or account is required.

---

## Prerequisites

- **Node.js 22.9+** (tested on Node 24)
- **Docker Desktop** (or Docker Engine + Compose)
- **[Ollama](https://ollama.com/download)**, installed natively (not containerized)

## Quick start

```bash
# 1. Pull the local models (one time, about 2.3 GB)
ollama pull llama3.2
ollama pull nomic-embed-text

# 2. Install dependencies
npm install

# 3. One-command setup: creates .env.local with a random SESSION_SECRET,
#    starts Postgres, applies migrations, seeds demo data, runs the doctor.
#    Safe to re-run: it never overwrites an existing .env.local.
npm run setup

# 4. Run the app
npm run dev        # http://localhost:3000
```

Sign up, or log in as the demo user `demo@plabix.local` / `demopassword123`.

### Manual setup (instead of `npm run setup`)

```bash
cp .env.example .env.local     # then set SESSION_SECRET (openssl rand -base64 32)
docker compose up -d --wait
npm run db:migrate             # idempotent; tracked in schema_migrations
npm run db:seed                # optional demo org, user and sample document
npm run doctor                 # verifies Node, config, DB, pgvector, Ollama, models
```

### Health check: `npm run doctor`

Checks Node version, configuration (including a too-low similarity
threshold), the PostgreSQL connection, pgvector, applied migrations, the
embedding column's dimensions, Ollama reachability, the installed models, and
whether the embedding dimensions match. Each failure prints the fix. The same
status is shown live in the app's health panel and at `GET /api/health`.

---

## How it works

1. **Upload**: files are validated by extension *and* magic bytes (a renamed
   `.exe` is rejected), size-limited, deduplicated per organization by
   SHA-256, and stored under `UPLOAD_DIR` (path-traversal protected). The API
   returns `202` right away.
2. **Background ingestion**: a worker started from `src/instrumentation.ts`
   extracts text (pdfjs-dist with per-page text, mammoth for DOCX), chunks it
   without merging across PDF pages, embeds the chunks, and marks the document
   `ready`. Documents that are `pending`, or `processing` for longer than
   `INGESTION_STALE_MINUTES` (after a crash or restart), are picked up again
   automatically. Seeded documents therefore index themselves on first start.
3. **Retrieval**: hybrid search. HNSW vector search and Postgres full-text
   search are fused with Reciprocal Rank Fusion, then filtered by a similarity
   threshold. Every query is scoped by `organization_id`.
4. **Answer**: the model gets only the retrieved excerpts inside delimited
   `<source>` blocks and must cite them as `[1]`, `[2]`. Invalid citation
   numbers are stripped. A page is cited only when its chunk scores close to
   the document's best match. If nothing relevant is retrieved, the app answers
   *"I couldn't find this information in your uploaded documents."* without
   calling the model, and shows no sources.

### Follow-up questions

Elliptical follow-ups ("And sick leave?", "Does that include weekends?") are
searched together with the previous question. Self-contained questions, even
short ones like "What is the capital of France?", are searched on their own,
so an earlier topic can't leak into an unrelated answer.

### Tuning (`.env.local`)

| Variable                   | Default | Notes |
|----------------------------|---------|-------|
| `RAG_SIMILARITY_THRESHOLD` | `0.6`   | Calibrated for `nomic-embed-text` with task prefixes: relevant questions score about 0.65 or higher, unrelated ones about 0.40–0.56. Lower values let unrelated questions get answers (`npm run doctor` warns below 0.55). |
| `RAG_TOP_K`                | `5`     | Chunks passed to the model. |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | `1000` / `150` | Characters. Re-upload documents after changing these. |
| `RAG_MAX_CONTEXT_CHARS`    | `8000`  | Prompt budget for excerpts. |
| `INGESTION_CONCURRENCY`    | `1`     | Keep at 1 on a single machine running Ollama. |
| `OLLAMA_NUM_CTX`           | `4096`  | Ollama's default context is too small for RAG prompts. |

If you switch embedding models, set `OLLAMA_EMBEDDING_DIMENSIONS` to match,
then re-check the threshold. Similarity scales differ between models.

---

## Testing

| Command                    | What it runs |
|----------------------------|--------------|
| `npm run lint`             | ESLint (flat config, `eslint-config-next`) |
| `npm run typecheck`        | `tsc --noEmit` |
| `npm test`                 | 83 unit tests (Vitest): chunking, PDF/DOCX extraction, upload validation, storage, retrieval ranking, citations, follow-up detection, security helpers. No DB or Ollama needed. |
| `npm run check`            | lint + typecheck + unit tests |
| `npm run build`            | Production build |
| `npm run test:integration` | 24 end-to-end HTTP tests against a **running** app with real Postgres and Ollama |

### Integration suite

```bash
npm run dev                    # or: npm run build && npm start
npm run test:integration       # in a second terminal
```

To target another URL or port, set `INTEGRATION_BASE_URL`:

```bash
INTEGRATION_BASE_URL=http://127.0.0.1:3100 npm run test:integration
```

It covers health, auth (401s, login redirect, generic login errors,
duplicate sign-up, CSRF origin check, security headers), ingestion (Markdown
without a MIME type, a multi-page PDF, rejection of duplicate, fake-PDF,
`.exe` and empty files, library search), grounded answers (the 24-day
annual-leave answer, the correct PDF page citation, refusals for three
unrelated questions, chat history), organization isolation for documents,
conversations, dashboards and usage, malformed IDs, document deletion, and
session invalidation on logout. CPU-only inference makes a full run take about
3–4 minutes.

The suite creates its own throwaway accounts (`it-*@example.test`, one
organization each) and never touches existing users. To remove them later:

```sql
-- docker exec -it plabix-nexus-postgres psql -U plabix -d plabix_nexus
BEGIN;
DELETE FROM organizations WHERE id IN (
  SELECT m.organization_id FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE u.email LIKE 'it-%@example.test'
);  -- cascades to memberships, documents, chunks, conversations, usage events
DELETE FROM users WHERE email LIKE 'it-%@example.test';  -- and their sessions
COMMIT;
```

Uploaded files for those organizations stay under `storage/documents/<org-id>/`
and can be deleted by hand.

### Manual end-to-end check

1. Upload `tests/fixtures/employee-leave-policy.txt` on the Documents page and
   wait for the status to become `ready`.
2. Ask **"How many annual leave days does an employee receive?"** It should
   answer 24 days and cite the document.
3. Ask **"What is the capital of France?"** It should reply that the
   information wasn't found, with no sources.

---

## Production

```bash
npm run build
npm start
```

In production (`NODE_ENV=production`) the server **refuses to serve
requests** unless `SESSION_SECRET` is a random value of 32+ characters and
`DATABASE_URL` is set. Every request returns 500, and the reason is logged at
startup. Session cookies are `Secure` by default, so serve the app over HTTPS
or set `SESSION_COOKIE_SECURE=false` for plain-HTTP LAN testing. Set
`TRUST_PROXY=true` only behind a reverse proxy you control.

## Backups

All data lives in the `plabix_nexus_pgdata` Docker volume and in `storage/`.

```bash
mkdir -p backups
docker exec plabix-nexus-postgres pg_dump -U plabix -d plabix_nexus -Fc > backups/nexus-$(date +%F).dump
# restore:
docker exec -i plabix-nexus-postgres pg_restore -U plabix -d plabix_nexus --clean < backups/nexus-YYYY-MM-DD.dump
```

`backups/` and `storage/` are git-ignored. Migrations are additive and
idempotent, so `npm run db:migrate` is safe on an existing database.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ECONNRESET` / cannot connect to Postgres on Windows | Use `127.0.0.1`, not `localhost`, in `DATABASE_URL` (Docker Desktop resets IPv6 `::1`). |
| Document stuck in `processing` | It is re-queued automatically after `INGESTION_STALE_MINUTES` (default 30), or click **Retry**. Check that Ollama is running. |
| Unrelated questions get answers | Raise `RAG_SIMILARITY_THRESHOLD` to `0.6`. Run `npm run doctor`. |
| First answer is very slow | Model cold start. `OLLAMA_KEEP_ALIVE=30m` keeps it loaded afterwards. |
| `npm start` serves only 500s | Insecure production config: set a real `SESSION_SECRET` (see above). |
| `EADDRINUSE :3000` | Another server is already running. Stop it or use `next start -p 3100`. |

---

## Project structure

```
src/
  app/
    (auth)/login, signup            public auth pages
    (app)/dashboard, documents,     authenticated app shell
      chat, organization, settings, usage
    api/                            route handlers (auth, documents, chat, health, usage, ...)
  instrumentation.ts                starts the background ingestion worker, checks config
  lib/
    ai/                             provider abstraction (chat + embeddings, Ollama)
    auth/                           password hashing, sessions, route guard
    db/                             Postgres pool + transaction helpers
    rag/                            extraction, chunking, ingest, queue, retrieval, answer
    security/                       rate limiting
    storage/                        storage abstraction (local filesystem)
    observability/                  AI usage event logging
  components/                       nav sidebar, health panel, UI primitives
migrations/                         001_init.sql, 002_reliability.sql (additive, idempotent)
scripts/                            setup, migrate, seed, doctor
tests/                              unit tests, fixtures, helpers, integration/ (HTTP E2E)
```

## Adding a new AI provider

1. Implement `ChatProvider` and/or `EmbeddingProvider` (see `src/lib/ai/types.ts`)
   in `src/lib/ai/providers/<name>.ts`.
2. Add a `case` for it in `src/lib/ai/provider.ts`.
3. Set `AI_PROVIDER=<name>` in `.env.local`.

The RAG pipeline, routes and UI depend only on those interfaces.

## Security notes

- **Tenant isolation**: every document, chunk, conversation and vector query
  is scoped by `organization_id` (see `src/lib/rag/retrieval.ts` and
  `src/lib/auth/guard.ts`). The integration suite verifies this across two
  organizations.
- **Passwords**: bcrypt (12 rounds) with timing-safe login, so unknown emails
  take as long as wrong passwords. Passwords are never logged or returned.
- **Sessions**: opaque random tokens. Only their SHA-256 hash is stored, and
  logout invalidates the session server-side.
- **Requests**: same-origin check on state-changing requests, rate limits on
  login, sign-up, password change, uploads and chat, and security headers
  (CSP, `X-Frame-Options: DENY`, `nosniff`).
- **Prompt injection**: retrieved content is delimited, `<source>` tags inside
  documents are neutralized, and the system prompt tells the model to treat
  excerpts as data, never as instructions.
