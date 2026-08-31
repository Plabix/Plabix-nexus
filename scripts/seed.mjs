// Creates a demo organization + user and ingests the sample leave-policy
// document so you can immediately test the RAG flow end to end.
//
// Usage: npm run db:seed
// Requires: migrations already applied, Ollama running with both models pulled.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_EMAIL = "demo@plabix.local";
const DEMO_PASSWORD = "demopassword123";
const DEMO_ORG_NAME = "Plabix Demo Co";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  const existing = await client.query("SELECT id FROM users WHERE email = $1", [DEMO_EMAIL]);
  let userId;
  let orgId;

  if (existing.rows.length > 0) {
    console.log("Demo user already exists, reusing it.");
    userId = existing.rows[0].id;
    const membership = await client.query(
      "SELECT organization_id FROM memberships WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    orgId = membership.rows[0].organization_id;
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const userResult = await client.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id",
      [DEMO_EMAIL, passwordHash, "Demo User"]
    );
    userId = userResult.rows[0].id;

    const orgResult = await client.query(
      "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
      [DEMO_ORG_NAME, "plabix-demo-co"]
    );
    orgId = orgResult.rows[0].id;

    await client.query(
      "INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')",
      [userId, orgId]
    );
    console.log(`Created demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  // Register the sample document as 'pending' — the running app's ingestion
  // pipeline (via /api/documents) is what actually chunks + embeds it, since
  // that requires a live Ollama instance which this script does not assume.
  const fixturePath = path.join(__dirname, "..", "tests", "fixtures", "employee-leave-policy.txt");
  const content = readFileSync(fixturePath);

  const docExists = await client.query(
    "SELECT id FROM documents WHERE organization_id = $1 AND file_name = $2",
    [orgId, "employee-leave-policy.txt"]
  );

  if (docExists.rows.length === 0) {
    const storagePath = path.join(__dirname, "..", "storage", "seed", "employee-leave-policy.txt");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, content);

    await client.query(
      `INSERT INTO documents (organization_id, uploaded_by, file_name, file_type, file_size_bytes, storage_path, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [orgId, userId, "employee-leave-policy.txt", "text/plain", content.length, storagePath]
    );
    console.log(
      "Seeded sample document as 'pending'. Log in and it will process automatically " +
        "(or trigger it via the Documents page / retry) once Ollama is running."
    );
  } else {
    console.log("Sample document already seeded.");
  }

  await client.end();
  console.log("\nSeed complete. Log in with:");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
