import { NextResponse } from "next/server";
import { query } from "@/lib/db/pool";
import { requireAuth, withErrorHandling } from "@/lib/auth/guard";

export const GET = withErrorHandling(async () => {
  const { organizationId } = await requireAuth();

  const events = await query(
    `SELECT event_type, provider, model, duration_ms, success, error_message, created_at
     FROM ai_usage_events
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [organizationId]
  );

  const summary = await query(
    `SELECT event_type,
            COUNT(*) AS count,
            AVG(duration_ms)::int AS avg_duration_ms,
            COUNT(*) FILTER (WHERE success = false) AS failures
     FROM ai_usage_events
     WHERE organization_id = $1
     GROUP BY event_type`,
    [organizationId]
  );

  return NextResponse.json({ events, summary });
});
