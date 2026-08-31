"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

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

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary[]>([]);
  const [events, setEvents] = useState<UsageEvent[]>([]);

  useEffect(() => {
    apiFetch<{ summary: UsageSummary[]; events: UsageEvent[] }>("/api/usage").then((data) => {
      setSummary(data.summary);
      setEvents(data.events);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Usage &amp; System Health</h1>
        <p className="text-sm text-slate-500">
          Local AI activity — no paid API usage, no billing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summary.map((s) => (
          <div key={s.event_type} className="card p-4">
            <p className="text-xs uppercase text-slate-500">{s.event_type}</p>
            <p className="text-xl font-semibold text-slate-900">{s.count}</p>
            <p className="text-xs text-slate-500">
              avg {s.avg_duration_ms ?? 0}ms · {s.failures} failed
            </p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
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
            {events.map((e, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{e.event_type}</td>
                <td className="px-4 py-3 text-slate-600">{e.model ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{e.duration_ms ?? "—"}ms</td>
                <td className="px-4 py-3">
                  {e.success ? (
                    <span className="badge bg-emerald-100 text-emerald-700">ok</span>
                  ) : (
                    <span className="badge bg-red-100 text-red-700">failed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {new Date(e.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
