"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { SystemHealth } from "@/components/system-health";

interface Me {
  user: { id: string; email: string; fullName: string | null } | null;
}

function ChangePasswordForm() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (form.newPassword !== form.confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      setDone(true);
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-5">
      <h2 className="font-medium text-slate-900">Change password</h2>
      <p className="text-xs text-slate-500">This signs you out on all other devices.</p>
      {error && <ErrorBanner message={error} />}
      {done && <p className="text-sm text-emerald-700">Password changed.</p>}
      <input className="input" type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
      <input className="input" type="password" autoComplete="new-password" placeholder="New password (min. 8 characters)" aria-label="New password" required minLength={8} maxLength={72} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Confirm new password" aria-label="Confirm new password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiFetch<Me>("/api/auth/me").then(setMe).catch(() => setMe({ user: null }));
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Your account and the local AI configuration." />

      <div className="card space-y-4 p-5">
        <div>
          <p className="text-xs font-medium text-slate-500">Email</p>
          <p className="text-sm text-slate-800">{me?.user?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Full name</p>
          <p className="text-sm text-slate-800">{me?.user?.fullName ?? "—"}</p>
        </div>
      </div>

      <ChangePasswordForm />

      <div className="card p-5">
        <h2 className="mb-2 font-medium text-slate-900">AI provider</h2>
        <p className="text-sm text-slate-600">
          Running on Ollama — local models on your own hardware, $0 API cost, and your
          documents never leave this machine. Models are configured via environment
          variables (<code className="text-xs">OLLAMA_CHAT_MODEL</code>,{" "}
          <code className="text-xs">OLLAMA_EMBEDDING_MODEL</code>).
        </p>
      </div>

      <SystemHealth />
    </div>
  );
}
