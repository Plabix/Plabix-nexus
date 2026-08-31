"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { apiFetch, ApiError } from "@/lib/api-client";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  status: "pending" | "processing" | "ready" | "failed";
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

const STATUS_STYLES: Record<Document["status"], string> = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    apiFetch<{ documents: Document[] }>("/api/documents")
      .then((data) => setDocuments(data.documents))
      .catch(() => setError("Failed to load documents."));
  }, []);

  useEffect(() => {
    load();
    // Poll for status updates every 3s while any document is processing.
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new ApiError(data.error, res.status);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document and all its knowledge chunks?")) return;
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      load();
    } catch {
      setError("Failed to delete document.");
    }
  }

  async function handleRetry(id: string) {
    try {
      await apiFetch(`/api/documents/${id}/retry`, { method: "POST" });
      load();
    } catch {
      setError("Failed to retry document.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-500">
            Upload PDFs, DOCX, TXT, or Markdown files to build your knowledge base.
          </p>
        </div>
        <label className="btn-primary cursor-pointer">
          {uploading ? "Uploading…" : "Upload document"}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.docx"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card overflow-hidden">
        {documents.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No documents yet. Upload your first document to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Chunks</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{doc.file_name}</p>
                    {doc.error_message && (
                      <p className="mt-0.5 text-xs text-red-600">{doc.error_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx("badge", STATUS_STYLES[doc.status])}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{doc.chunk_count}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {doc.status === "failed" && (
                      <button
                        onClick={() => handleRetry(doc.id)}
                        className="mr-3 text-brand-600 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
