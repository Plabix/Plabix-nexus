"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ErrorBanner, LoadingBlock, PageHeader } from "@/components/ui";

interface OrganizationData {
  organization: { id: string; name: string; slug: string; created_at: string };
  members: { id: string; email: string; full_name: string | null; role: string; created_at: string }[];
  role: "owner" | "admin" | "member";
}

export default function OrganizationPage() {
  const [data, setData] = useState<OrganizationData | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<OrganizationData>("/api/organization")
      .then((d) => {
        setData(d);
        setName(d.organization.name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load organization."));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { organization } = await apiFetch<{ organization: OrganizationData["organization"] }>(
        "/api/organization",
        { method: "PATCH", body: JSON.stringify({ name }) }
      );
      setData((d) => (d ? { ...d, organization } : d));
      setMessage("Organization name updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const canEdit = data?.role === "owner" || data?.role === "admin";

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Organization"
        description="All documents and conversations are isolated to your organization."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {!data && !error && <LoadingBlock />}

      {data && (
        <>
          <form onSubmit={handleSave} className="card space-y-4 p-5">
            <div>
              <label htmlFor="org-name" className="text-xs font-medium text-slate-500">Name</label>
              {canEdit ? (
                <input id="org-name" className="input mt-1" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
              ) : (
                <p className="text-sm text-slate-800">{data.organization.name}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Workspace ID</p>
              <p className="text-sm text-slate-800">{data.organization.slug}</p>
            </div>
            {message && <p className="text-sm text-emerald-700">{message}</p>}
            {canEdit && (
              <button type="submit" className="btn-primary" disabled={saving || !name.trim() || name === data.organization.name}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            )}
          </form>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="font-medium text-slate-900">Members ({data.members.length})</h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{m.full_name || m.email}</p>
                    {m.full_name && <p className="truncate text-xs text-slate-500">{m.email}</p>}
                  </div>
                  <span className="badge bg-slate-100 capitalize text-slate-600">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
