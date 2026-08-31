# Plabix Nexus

> Your company's AI knowledge operating system — 100% local AI, $0 API cost.

Plabix Nexus lets a business upload internal documents (PDFs, DOCX, TXT,
Markdown) and ask questions about them in plain language. Answers are
grounded strictly in the retrieved document content, with sources cited —
powered entirely by a local Ollama model, so there are no API bills.

This is the first product in the Plabix ecosystem, built as a reusable
foundation (provider-abstracted AI layer, multi-tenant data model) for
future Plabix products.

---

## Stack

| Layer       | Choice                                    |
|-------------|--------------------------------------------|
| Frontend    | Next.js 14 (App Router) + React + TypeScript + Tailwind |
| Backend     | Next.js API routes                        |
| Database    | PostgreSQL + pgvector                     |
| AI (chat)   | Ollama — `llama3.2` (default)             |
| AI (embed)  | Ollama — `nomic-embed-text` (default)     |
| Auth        | Session cookies + bcrypt, no external provider |
| Infra       | Docker Compose (Postgres only)            |

The AI layer is provider-abstracted (`src/lib/ai/`) — swapping in OpenAI,
Gemini, or Anthropic later means writing one new provider file and changing
`AI_PROVIDER`, not touching the RAG pipeline, routes, or UI.

---

## Prerequisites

- Node.js 20+
- Docker Desktop (or Docker Engine + Compose)
- [Ollama](https://ollama.com/download) installed natively (not containerized)

## 1. Install Ollama models

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
ollama serve   # if not already running as a background service
```

## 2. Start Postgres + pgvector

```bash
docker compose up -d
```

This also runs `migrations/001_init.sql` automatically on first boot (via
the Postgres image's `docker-entrypoint-initdb.d` mechanism). If you ever
need to re-run migrations manually against an existing volume:

```bash
npm run db:migrate
```

## 3. Configure environment

```bash
cp .env.example .env.local
# generate a real session secret:
openssl rand -base64 32
# paste it into SESSION_SECRET in .env.local
```

## 4. Install dependencies and run

```bash
npm install
npm run dev
```

App runs at http://localhost:3000. Sign up, then upload a document from the
**Documents** page.

## 5. (Optional) Seed demo data

```bash
npm run db:seed
```

Creates a demo user (`demo@plabix.local` / `demopassword123`) and registers
the sample leave-policy document (`tests/fixtures/employee-leave-policy.txt`)
as `pending`. Log in as that user and click **Retry** on the document in the
Documents page to trigger processing (the seed script itself doesn't call
Ollama, since it may not be running yet when you seed).

---

## Manual end-to-end test (matches the product spec)

1. Upload `tests/fixtures/employee-leave-policy.txt` via the Documents page.
2. Wait for status to become `ready`.
3. Start a new chat and ask: **"How many annual leave days does an employee
   receive?"** → should answer "24 days" and cite the document.
4. Ask an unrelated question, e.g. **"What is the capital of France?"** →
   should respond that the information wasn't found in your documents.

---

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

---

## Project structure

```
src/
  app/
    (auth)/login, (auth)/signup       — public auth pages
    (app)/dashboard, documents, chat, — authenticated app shell
    organization, settings, usage
    api/                              — all backend routes
  lib/
    ai/                               — provider abstraction (chat + embeddings)
      provider.ts                     — factory: getChatProvider() / getEmbeddingProvider()
      providers/ollama-chat.ts
      providers/ollama-embeddings.ts
    auth/                             — password hashing, sessions, route guard
    db/                               — Postgres pool + query helpers
    rag/                              — extraction, chunking, ingest, retrieval, answer
    observability/                    — AI usage event logging
    storage/                          — local filesystem document storage
  components/                        — shared UI (nav sidebar)
migrations/                          — SQL schema, applied automatically by Docker
scripts/                             — migrate.mjs, seed.mjs
tests/                               — Vitest unit tests + sample fixture document
```

## Adding a new AI provider later

1. Implement `ChatProvider` and/or `EmbeddingProvider` (see `src/lib/ai/types.ts`)
   in `src/lib/ai/providers/<name>.ts`.
2. Add a `case` for it in `src/lib/ai/provider.ts`.
3. Set `AI_PROVIDER=<name>` in `.env.local`.

No other file needs to change — the RAG pipeline, routes, and UI depend only
on the `ChatProvider`/`EmbeddingProvider` interfaces.

## Security notes

- Every document and vector query is scoped by `organization_id` — see
  `src/lib/rag/retrieval.ts` and `src/lib/auth/guard.ts`. There is no code
  path that returns another organization's data.
- Passwords are hashed with bcrypt (12 rounds), never logged or returned.
- Sessions are opaque random tokens; only their SHA-256 hash is stored server-side.
- The RAG system prompt explicitly instructs the model to treat retrieved
  document content as untrusted data, not instructions (prompt-injection guard).
