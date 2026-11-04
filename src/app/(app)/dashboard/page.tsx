"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ErrorBanner, LoadingBlock, PageHeader, StatusBadge, timeAgo, type DocumentStatus } from "@/components/ui";
import { SystemHealth } from "@/components/system-health";

interface DashboardStats {
  documents: { total: string; ready: string; failed: string; processing: string };
  chunks: { total: string };
  conversations: { total: string };
  questions: { total: string; last_7_days: string; avg_latency_ms: number | null };
  recentDocuments: { id: string; file_name: string; status: DocumentStatus; created_at: string }[];
  recentQuestions: { content: string; created_at: string; conversation_id: string }[];
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function GettingStarted({ stats }: { stats: DashboardStats }) {
  const steps = [
    { done: Number(stats.documents.total) > 0, label: "Upload your first document", href: "/documents" },
    { done: Number(stats.documents.ready) > 0, label: "Wait for it to finish processing", href: "/documents" },
    { done: Number(stats.questions.total) > 0, label: "Ask the AI a question", href: "/chat" },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <div className="card p-5">
      <h2 className="mb-3 font-medium text-slate-900">Get started</h2>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span
              className={
                s.done
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
                  : "flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-500"
              }
            >
              {s.done ? "✓" : i + 1}
            </span>
            {s.done ? (
              <span className="text-slate-400 line-through">{s.label}</span>
            ) : (
              <Link href={s.href} className="font-medium text-brand-600 hover:underline">
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardStats>("/api/dashboard/stats")
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard."));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your knowledge base."
        actions={
          <>
            <Link href="/documents" className="btn-secondary">Upload documents</Link>
            <Link href="/chat" className="btn-primary">Ask a question</Link>
          </>
        }
      />

      {error && <ErrorBanner message={error} />}
      {!stats && !error && <LoadingBlock label="Loading dashboard…" />}

      {stats && (
        <>
          <GettingStarted stats={stats} />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Documents"
              value={stats.documents.total}
              hint={`${stats.documents.ready} ready${Number(stats.documents.processing) ? ` · ${stats.documents.processing} processing` : ""}${Number(stats.documents.failed) ? ` · ${stats.documents.failed} failed` : ""}`}
            />
            <StatCard label="Knowledge chunks" value={stats.chunks.total} hint="Searchable passages" />
            <StatCard
              label="Questions asked"
              value={stats.questions.total}
              hint={`${stats.questions.last_7_days} in the last 7 days`}
            />
            <StatCard
              label="Avg. answer time"
              value={stats.questions.avg_latency_ms ? `${(stats.questions.avg_latency_ms / 1000).toFixed(1)}s` : "—"}
              hint="Local model, $0 API cost"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-5">
              <h2 className="mb-3 font-medium text-slate-900">Recent documents</h2>
              {stats.recentDocuments.length === 0 ? (
                <p className="text-sm text-slate-500">No documents uploaded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentDocuments.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700" title={d.file_name}>{d.file_name}</span>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-3 font-medium text-slate-900">Your recent questions</h2>
              {stats.recentQuestions.length === 0 ? (
                <p className="text-sm text-slate-500">No questions asked yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentQuestions.map((q, i) => (
                    <li key={i} className="text-sm">
                      <Link href={`/chat/${q.conversation_id}`} className="block truncate text-slate-700 hover:text-brand-600">
                        {q.content}
                      </Link>
                      <span className="text-xs text-slate-400">{timeAgo(q.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <SystemHealth />
          </div>
        </>
      )}
    </div>
  );
}
