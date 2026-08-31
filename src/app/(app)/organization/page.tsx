"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Me {
  organization: { id: string; name: string; slug: string } | null;
}

export default function OrganizationPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiFetch<Me>("/api/auth/me").then(setMe);
  }, []);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Organization</h1>
        <p className="text-sm text-slate-500">
          All documents and conversations are isolated to your organization.
        </p>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="text-xs font-medium text-slate-500">Name</label>
          <p className="text-sm text-slate-800">{me?.organization?.name ?? "—"}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Slug</label>
          <p className="text-sm text-slate-800">{me?.organization?.slug ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
