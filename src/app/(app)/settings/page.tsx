"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Me {
  user: { id: string; email: string; fullName: string | null } | null;
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiFetch<Me>("/api/auth/me").then(setMe);
  }, []);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Your account details.</p>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="text-xs font-medium text-slate-500">Email</label>
          <p className="text-sm text-slate-800">{me?.user?.email ?? "—"}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Full name</label>
          <p className="text-sm text-slate-800">{me?.user?.fullName ?? "—"}</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-2 font-medium text-slate-900">AI Provider</h2>
        <p className="text-sm text-slate-600">
          Running on Ollama — local models, $0 API cost. Configured via environment
          variables (<code className="text-xs">AI_PROVIDER</code>,{" "}
          <code className="text-xs">OLLAMA_CHAT_MODEL</code>,{" "}
          <code className="text-xs">OLLAMA_EMBEDDING_MODEL</code>).
        </p>
      </div>
    </div>
  );
}
