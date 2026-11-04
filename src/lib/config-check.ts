const PLACEHOLDER_SECRETS = new Set(["", "replace-this-with-a-long-random-secret"]);

/** Returns a list of configuration problems that make the app unsafe to run. */
export function findInsecureConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const secret = env.SESSION_SECRET ?? "";
  if (PLACEHOLDER_SECRETS.has(secret) || secret.length < 32) {
    problems.push("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set.");
  return problems;
}

/**
 * Refuses to start in production with an insecure configuration; in
 * development, only warns so first-run setup stays easy.
 */
export function assertSecureConfig(): void {
  const problems = findInsecureConfig();
  if (problems.length === 0) return;
  const message = `Insecure configuration:\n  - ${problems.join("\n  - ")}`;
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(`[config] ${message}\n  (allowed in development; refused in production)`);
}
