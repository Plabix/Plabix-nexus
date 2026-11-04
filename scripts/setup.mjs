// One-time local setup: creates .env.local (if missing) with a random session
// secret, starts PostgreSQL via Docker Compose, applies migrations, seeds demo
// data and runs the doctor. Safe to re-run; never overwrites .env.local.
//
// Usage: npm run setup
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = path.join(root, ".env.local");

function run(command, args, { allowFailure = false } = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0 && !allowFailure) {
    console.error(`\nSetup stopped: \`${command} ${args.join(" ")}\` failed.`);
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

if (existsSync(envLocal)) {
  console.log(".env.local already exists — leaving it unchanged.");
} else {
  const template = readFileSync(path.join(root, ".env.example"), "utf8");
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(envLocal, template.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`));
  console.log("Created .env.local with a random SESSION_SECRET.");
}

run("docker", ["compose", "up", "-d", "--wait"]);
run("node", ["--env-file-if-exists=.env.local", "scripts/migrate.mjs"]);
run("node", ["--env-file-if-exists=.env.local", "scripts/seed.mjs"]);
run("node", ["--env-file-if-exists=.env.local", "scripts/doctor.mjs"], { allowFailure: true });

console.log("\nSetup finished. Start the app with:  npm run dev   → http://localhost:3000");
