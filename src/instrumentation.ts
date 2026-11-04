/**
 * Runs once when the Next.js server starts. Boots the background ingestion
 * worker so documents left pending (seed script, crash, restart) get processed.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.INGESTION_WORKER === "off") return;

  const { assertSecureConfig } = await import("@/lib/config-check");
  assertSecureConfig();

  const { startIngestionWorker } = await import("@/lib/rag/queue");
  startIngestionWorker();
}
