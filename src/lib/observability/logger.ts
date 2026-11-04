import { query } from "@/lib/db/pool";

interface LogAIUsageInput {
  organizationId: string | null;
  eventType: "embedding" | "chat" | "extraction" | "chunking" | "retrieval";
  provider?: string;
  model?: string;
  durationMs?: number;
  success: boolean;
  errorMessage?: string;
}

/** Writes a row to ai_usage_events for the Usage/System Health dashboard. */
export async function logAIUsage(input: LogAIUsageInput): Promise<void> {
  try {
    await query(
      `INSERT INTO ai_usage_events
         (organization_id, event_type, provider, model, duration_ms, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.organizationId,
        input.eventType,
        input.provider ?? "ollama",
        input.model ?? null,
        input.durationMs ?? null,
        input.success,
        input.errorMessage ?? null,
      ]
    );
  } catch (err) {
    // Observability must never break the request path.
    console.error("Failed to log AI usage event:", err);
  }
}
