import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { checkAIHealth } from "@/lib/ai/provider";
import { queueStats } from "@/lib/rag/queue";

/**
 * System health: database, pgvector, Ollama and required models.
 * Public (used by uptime checks), so it reports status only — no data.
 */
export async function GET() {
  let database: "ok" | "error" = "error";
  let vector: "ok" | "missing" | "unknown" = "unknown";
  try {
    const result = await getPool().query<{ installed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"
    );
    database = "ok";
    vector = result.rows[0]?.installed ? "ok" : "missing";
  } catch {
    database = "error";
  }

  const ai = await checkAIHealth();
  const modelsReady = ai.reachable && ai.models.every((m) => m.available);

  const status = {
    status: database === "ok" && vector === "ok" && modelsReady ? "ok" : "degraded",
    database,
    vector,
    ollama: ai.reachable ? "ok" : "error",
    models: ai.models,
    ingestion: queueStats(),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(status, {
    status: database === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
