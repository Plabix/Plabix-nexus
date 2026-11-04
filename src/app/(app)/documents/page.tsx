"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  formatBytes,
  timeAgo,
  type DocumentStatus,
} from "@/components/ui";

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  uploaded_by_name: string | null;
  uploaded_by_email: string | null;
}

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  error?: string;
  done?: boolean;
}

const ACCEPT = ".pdf,.txt,.md,.markdown,.docx";

/** XHR instead of fetch: fetch can't report upload progress. */
function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: { error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(data.error || "Upload failed.", xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload.", 0));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | DocumentStatus>("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    try {
      const data = await apiFetch<{ documents: Document[] }>(`/api/documents?${params}`);
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load documents.");
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 200); // debounce search typing
    return () => clearTimeout(timer);
  }, [load]);

  // Poll only while something is still being processed.
  const hasActiveWork = documents?.some((d) => d.status === "pending" || d.status === "processing");
  useEffect(() => {
    if (!hasActiveWork) return;
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [hasActiveWork, load]);

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setError(null);
    const items = files.map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, name: f.name, progress: 0 }));
    setUploads((prev) => [...items, ...prev].slice(0, 20));

    for (const [i, file] of files.entries()) {
      const id = items[i]!.id;
      const update = (patch: Partial<UploadItem>) =>
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
      try {
        await uploadWithProgress(file, (progress) => update({ progress }));
        update({ progress: 100, done: true });
      } catch (err) {
        update({ error: err instanceof ApiError ? err.message : "Upload failed." });
      }
      load();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(doc: Document) {
    if (!confirm(`Delete "${doc.file_name}" and all its knowledge chunks?`)) return;
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete document.");
    }
  }

  async function handleRetry(id: string) {
    try {
      await apiFetch(`/api/documents/${id}/retry`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to retry document.");
    }
  }

  const activeUploads = uploads.filter((u) => !u.done || u.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Upload PDFs, DOCX, TXT, or Markdown files to build your knowledge base."
        actions={
          <label className="btn-primary cursor-pointer">
            Upload documents
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              accept={ACCEPT}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
        }
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={clsx(
          "rounded-xl border-2 border-dashed p-6 text-center text-sm transition",
          dragging ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-500"
        )}
      >
        Drag and drop files here — PDF, DOCX, TXT or MD, up to 20 MB each.
      </div>

      {activeUploads.length > 0 && (
        <ul className="card divide-y divide-slate-100" aria-label="Uploads">
          {activeUploads.map((u) => (
            <li key={u.id} className="px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate font-medium text-slate-800">{u.name}</span>
                <span className={u.error ? "text-red-600" : "text-slate-500"}>
                  {u.error ? "Failed" : `${u.progress}%`}
                </span>
              </div>
              {u.error ? (
                <p className="mt-1 text-xs text-red-600">{u.error}</p>
              ) : (
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={u.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${u.progress}%` }} />
                </div>
              )}
            </li>
          ))}
          {activeUploads.some((u) => u.error) && (
            <li className="px-4 py-2 text-right">
              <button
                className="text-xs text-slate-500 hover:underline"
                onClick={() => setUploads((prev) => prev.filter((u) => !u.error))}
              >
                Clear failed uploads
              </button>
            </li>
          )}
        </ul>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input sm:max-w-xs"
          type="search"
          placeholder="Search documents…"
          aria-label="Search documents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input sm:max-w-[12rem]"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | DocumentStatus)}
        >
          <option value="">All statuses</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="pending">Queued</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {documents === null ? (
          <LoadingBlock label="Loading documents…" />
        ) : documents.length === 0 ? (
          search || statusFilter ? (
            <EmptyState title="No matching documents" description="Try a different search or filter." />
          ) : (
            <EmptyState
              title="No documents yet"
              description="Upload your company policies, handbooks and guides. Plabix Nexus indexes them locally so your team can ask questions about them."
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Chunks</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Uploaded</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-medium text-slate-800" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      <p className="text-xs text-slate-400">{formatBytes(Number(doc.file_size_bytes))}</p>
                      {doc.status === "failed" && doc.error_message && (
                        <p className="mt-0.5 text-xs text-red-600">{doc.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{doc.chunk_count}</td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                      <span title={new Date(doc.created_at).toLocaleString()}>{timeAgo(doc.created_at)}</span>
                      {(doc.uploaded_by_name || doc.uploaded_by_email) && (
                        <p className="text-xs text-slate-400">by {doc.uploaded_by_name || doc.uploaded_by_email}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {doc.status === "failed" && (
                        <button
                          onClick={() => handleRetry(doc.id)}
                          className="mr-3 font-medium text-brand-600 hover:underline"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={doc.status === "processing"}
                        className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
