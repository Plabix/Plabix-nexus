import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { loadAIConfig } from "@/lib/ai/config";

/** System health check: DB connectivity + Ollama reachability. No auth required. */
export async function GET() {
  const config = loadAIConfig();
  const status: {
    database: "ok" | "error";
    ollama: "ok" | "error" | "unknown";
    timestamp: string;
  } = {
    database: "error",
    ollama: "unknown",
    timestamp: new Date().toISOString(),
  };

  try {
    await getPool().query("SELECT 1");
    status.database = "ok";
  } catch {
    status.database = "error";
  }

  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    status.ollama = res.ok ? "ok" : "error";
  } catch {
    status.ollama = "error";
  }

  const httpStatus = status.database === "ok" ? 200 : 503;
  return NextResponse.json(status, { status: httpStatus });
}
