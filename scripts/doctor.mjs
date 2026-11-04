// Diagnoses the local environment: Node, configuration, PostgreSQL, pgvector,
// migrations, Ollama, models and embedding dimensions. Never prints secrets.
//
// Usage: npm run doctor
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dns from "node:dns";
import pg from "pg";

// Docker Desktop on Windows resets IPv6 loopback (::1) connections; prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
let warnings = 0;

const ok = (msg) => console.log(`  ✔ ${msg}`);
const warn = (msg) => {
  warnings++;
  console.log(`  ! ${msg}`);
};
const fail = (msg, fix) => {
  failures++;
  console.log(`  ✖ ${msg}${fix ? `\n      → ${fix}` : ""}`);
};

async function checkNode() {
  console.log("Runtime");
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 9)) ok(`Node.js ${process.versions.node}`);
  else fail(`Node.js ${process.versions.node} is too old`, "Install Node.js 22.9 or newer.");
}

function checkConfig() {
  console.log("Configuration");
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is not set", "Run `npm run setup` or copy .env.example to .env.local.");
  } else ok("DATABASE_URL is set");
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32 || secret === "replace-this-with-a-long-random-secret") {
    warn("SESSION_SECRET is a placeholder or too short (fine for local dev, refused in production)");
  } else ok("SESSION_SECRET looks strong");
}

async function checkDatabase() {
  console.log("Database");
  if (!process.env.DATABASE_URL) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
  } catch (err) {
    fail(`Cannot connect to PostgreSQL (${err.code ?? err.message})`, "Start Docker Desktop, then run `docker compose up -d`.");
    return;
  }
  try {
    ok("PostgreSQL connected");
    const ext = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    if (ext.rows[0]) ok(`pgvector ${ext.rows[0].extversion}`);
    else fail("pgvector extension missing", "Run `npm run db:migrate`.");

    const files = readdirSync(path.join(__dirname, "..", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    let applied = new Set();
    try {
      const rows = await client.query("SELECT filename FROM schema_migrations");
      applied = new Set(rows.rows.map((r) => r.filename));
    } catch {
      // table missing → nothing applied
    }
    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) ok(`All ${files.length} migrations applied`);
    else fail(`Pending migrations: ${pending.join(", ")}`, "Run `npm run db:migrate`.");

    const dims = await client.query(
      `SELECT format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a
       WHERE a.attrelid = 'document_chunks'::regclass AND a.attname = 'embedding'`
    ).catch(() => ({ rows: [] }));
    if (dims.rows[0]) ok(`document_chunks.embedding is ${dims.rows[0].type}`);

    const docs = await client.query(
      "SELECT status, COUNT(*)::int AS n FROM documents GROUP BY status ORDER BY status"
    ).catch(() => ({ rows: [] }));
    if (docs.rows.length) ok(`Documents: ${docs.rows.map((r) => `${r.n} ${r.status}`).join(", ")}`);
    return dims.rows[0]?.type;
  } finally {
    await client.end();
  }
}

async function checkOllama(columnType) {
  console.log("Ollama");
  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const chatModel = process.env.OLLAMA_CHAT_MODEL || "llama3.2";
  const embedModel = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
  let installed;
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    installed = ((await res.json()).models ?? []).map((m) => m.name);
    ok(`Ollama reachable at ${base}`);
  } catch {
    fail(`Ollama not reachable at ${base}`, "Start the Ollama app, or run `ollama serve`.");
    return;
  }
  for (const model of [chatModel, embedModel]) {
    const name = model.includes(":") ? model : `${model}:latest`;
    if (installed.includes(model) || installed.includes(name)) ok(`Model installed: ${model}`);
    else fail(`Model missing: ${model}`, `Run \`ollama pull ${model}\`.`);
  }
  try {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: embedModel, input: "dimension check" }),
      signal: AbortSignal.timeout(60_000),
    });
    const length = (await res.json()).embeddings?.[0]?.length;
    const expected = Number(process.env.OLLAMA_EMBEDDING_DIMENSIONS || 768);
    if (length === expected) ok(`Embedding dimensions: ${length} (matches OLLAMA_EMBEDDING_DIMENSIONS)`);
    else fail(`Embedding model returns ${length} dimensions, config expects ${expected}`, "Fix OLLAMA_EMBEDDING_DIMENSIONS and the vector column size.");
    if (columnType && columnType !== `vector(${length})`) {
      fail(`Database column is ${columnType} but the model returns ${length} dimensions`, "Use a model with matching dimensions or add a migration to resize the column (requires re-embedding).");
    }
  } catch {
    fail("Embedding request failed", `Run \`ollama pull ${embedModel}\`.`);
  }
}

await checkNode();
checkConfig();
const columnType = await checkDatabase();
await checkOllama(columnType);

console.log(
  failures
    ? `\n${failures} problem(s) found${warnings ? `, ${warnings} warning(s)` : ""}.`
    : `\nAll checks passed${warnings ? ` (${warnings} warning(s))` : ""}.`
);
process.exit(failures ? 1 : 0);
