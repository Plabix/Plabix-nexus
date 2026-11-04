"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { EmptyState, ErrorBanner, LoadingBlock, PageHeader, timeAgo } from "@/components/ui";
import { SystemHealth } from "@/components/system-health";

interface UsageSummary {
  event_type: string;
  count: string;
  avg_duration_ms: number | null;
  failures: string;
}

interface UsageEvent {
  event_type: string;
  provider: string;
  model: string | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  chat: "AI answers",
  embedding: "Embeddings",
  extraction: "Text extraction",
  chunking: "Chunking",
};

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default function UsagePage() {
  const [data, setData] = useState<{ summary: UsageSummary[]; events: UsageEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ summary: UsageSummary[]; events: UsageEvent[] }>("/api/usage")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load usage."));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage & System Health"
        description="Local AI activity for your organization — no paid API usage, no billing."
      />

      <SystemHealth />

      {error && <ErrorBanner message={error} />}
      {!data && !error && <LoadingBlock />}

      {data && (
        <>
          {data.summary.length > 0 && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {data.summary.map((s) => (
                <div key={s.event_type} className="card p-4">
                  <p className="text-xs uppercase text-slate-500">{EVENT_LABELS[s.event_type] ?? s.event_type}</p>
                  <p className="text-xl font-semibold text-slate-900">{s.count}</p>
                  <p className="text-xs text-slate-500">
                    avg {formatMs(s.avg_duration_ms)} · {s.failures} failed
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="card overflow-hidden">
            {data.events.length === 0 ? (
              <EmptyState title="No AI activity yet" description="Upload a document or ask a question to see activity here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 font-medium">Model</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3">{EVENT_LABELS[e.event_type] ?? e.event_type}</td>
                        <td className="px-4 py-3 text-slate-600">{e.model ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{formatMs(e.duration_ms)}</td>
                        <td className="px-4 py-3">
                          {e.success ? (
                            <span className="badge bg-emerald-100 text-emerald-700">ok</span>
                          ) : (
                            <span className="badge bg-red-100 text-red-700" title={e.error_message ?? undefined}>
                              failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400" title={new Date(e.created_at).toLocaleString()}>
                          {timeAgo(e.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
