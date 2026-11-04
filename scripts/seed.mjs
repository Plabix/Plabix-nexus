// Creates a demo organization + user and registers the sample leave-policy
// document so you can immediately test the RAG flow end to end.
//
// Usage: npm run db:seed   (loads .env.local automatically)
// Requires: migrations already applied. The running app's background worker
// then extracts, chunks and embeds the document (Ollama must be running).
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dns from "node:dns";
import pg from "pg";
import bcrypt from "bcryptjs";

// Docker Desktop on Windows resets IPv6 loopback (::1) connections; prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_EMAIL = "demo@plabix.local";
const DEMO_PASSWORD = "demopassword123";
const DEMO_ORG_NAME = "Plabix Demo Co";
const FILE_NAME = "employee-leave-policy.txt";

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
    await client.query("BEGIN");
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
    await client.query("COMMIT");
    console.log(`Created demo user: ${DEMO_EMAIL}`);
  }

  const docExists = await client.query(
    "SELECT id, status FROM documents WHERE organization_id = $1 AND file_name = $2",
    [orgId, FILE_NAME]
  );

  if (docExists.rows.length === 0) {
    const content = readFileSync(path.join(__dirname, "..", "tests", "fixtures", FILE_NAME));
    // Same layout as the app's local storage provider: <UPLOAD_DIR>/<org>/<file>,
    // with the key stored relative to UPLOAD_DIR.
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || "./storage/documents");
    const key = `${orgId}/seed-${FILE_NAME}`;
    await mkdir(path.join(uploadDir, orgId), { recursive: true });
    await writeFile(path.join(uploadDir, key), content);

    await client.query(
      `INSERT INTO documents
         (organization_id, uploaded_by, file_name, file_type, file_size_bytes, storage_path,
          status, content_sha256)
       VALUES ($1, $2, $3, 'text/plain', $4, $5, 'pending', $6)`,
      [orgId, userId, FILE_NAME, content.length, key, createHash("sha256").update(content).digest("hex")]
    );
    console.log("Seeded sample document as 'pending'.");
  } else {
    console.log(`Sample document already seeded (status: ${docExists.rows[0].status}).`);
  }

  await client.end();
  console.log(
    "\nSeed complete. Start the app (npm run dev): its background worker indexes pending\n" +
      "documents automatically once Ollama is running.\n"
  );
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
