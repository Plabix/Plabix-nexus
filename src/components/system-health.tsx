"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Spinner } from "./ui";

interface Health {
  status: "ok" | "degraded";
  database: "ok" | "error";
  vector: "ok" | "missing" | "unknown";
  ollama: "ok" | "error";
  models: { name: string; role: "chat" | "embedding"; available: boolean }[];
  ingestion: { queued: number; active: number };
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block h-2 w-2 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")}
    />
  );
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex items-center gap-2 text-slate-700">
        <Dot ok={ok} /> {label}
      </span>
      <span className={clsx("text-xs", ok ? "text-slate-500" : "font-medium text-red-600")}>
        {detail}
      </span>
    </li>
  );
}

/** Live status of the local AI stack: database, pgvector, Ollama and models. */
export function SystemHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/health", { cache: "no-store" })
        .then((res) => res.json())
        .then((data: Health) => {
          if (!cancelled) {
            setHealth(data);
            setFailed(false);
          }
        })
        .catch(() => !cancelled && setFailed(true));
    load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-slate-900">System health</h2>
        {health && (
          <span
            className={clsx(
              "badge",
              health.status === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            )}
          >
            {health.status === "ok" ? "All systems operational" : "Needs attention"}
          </span>
        )}
      </div>
      {failed && <p className="text-sm text-red-600">Could not reach the server.</p>}
      {!health && !failed && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Checking…
        </p>
      )}
      {health && (
        <ul className="divide-y divide-slate-100">
          <Row label="Database" ok={health.database === "ok"} detail={health.database === "ok" ? "Connected" : "Unreachable"} />
          <Row label="pgvector" ok={health.vector === "ok"} detail={health.vector === "ok" ? "Installed" : "Missing"} />
          <Row label="Ollama" ok={health.ollama === "ok"} detail={health.ollama === "ok" ? "Running" : "Not running — start Ollama"} />
          {health.models.map((m) => (
            <Row
              key={m.name}
              label={`${m.role === "chat" ? "Chat" : "Embedding"} model`}
              ok={m.available}
              detail={m.available ? m.name : `${m.name} — run: ollama pull ${m.name}`}
            />
          ))}
          <Row
            label="Ingestion queue"
            ok
            detail={`${health.ingestion.active} processing · ${health.ingestion.queued} waiting`}
          />
        </ul>
      )}
    </div>
  );
}
