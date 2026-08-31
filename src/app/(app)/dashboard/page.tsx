"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface DashboardStats {
  documents: { total: string; ready: string; failed: string; processing: string };
  chunks: { total: string };
  conversations: { total: string };
  recentDocuments: { id: string; file_name: string; status: string; created_at: string }[];
  recentQuestions: { content: string; created_at: string }[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardStats>("/api/dashboard/stats")
      .then(setStats)
      .catch(() => setError("Failed to load dashboard."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">An overview of your knowledge base.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total documents" value={stats.documents.total} />
            <StatCard label="Ready" value={stats.documents.ready} />
            <StatCard label="Knowledge chunks" value={stats.chunks.total} />
            <StatCard label="Conversations" value={stats.conversations.total} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-3 font-medium text-slate-900">Recent documents</h2>
              {stats.recentDocuments.length === 0 ? (
                <p className="text-sm text-slate-500">No documents uploaded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentDocuments.map((d) => (
                    <li key={d.id} className="flex justify-between text-sm">
                      <span className="truncate text-slate-700">{d.file_name}</span>
                      <span className="text-slate-400">{d.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="mb-3 font-medium text-slate-900">Recent questions</h2>
              {stats.recentQuestions.length === 0 ? (
                <p className="text-sm text-slate-500">No questions asked yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentQuestions.map((q, i) => (
                    <li key={i} className="truncate text-sm text-slate-700">
                      {q.content}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
