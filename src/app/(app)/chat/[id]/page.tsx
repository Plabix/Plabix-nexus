"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ErrorBanner, LoadingBlock, Spinner } from "@/components/ui";

interface Source {
  ref?: number;
  documentId: string;
  documentName: string;
  similarity: number;
  pages?: number[];
  excerpt?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Source[];
  latency_ms?: number | null;
  created_at: string;
}

const SUGGESTIONS = [
  "Summarize our leave policy.",
  "How many annual leave days does an employee receive?",
  "What is the process for requesting time off?",
];

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sources</p>
      {sources.map((s, i) => (
        <details key={`${s.documentId}-${i}`} className="group rounded-lg border border-slate-200 bg-white text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-slate-700">
            {s.ref && (
              <span className="rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700">[{s.ref}]</span>
            )}
            <span className="truncate font-medium">{s.documentName}</span>
            {s.pages?.length ? (
              <span className="shrink-0 text-slate-400">
                {s.pages.length === 1 ? `p. ${s.pages[0]}` : `pp. ${s.pages.join(", ")}`}
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-slate-400">{Math.round(s.similarity * 100)}% match</span>
          </summary>
          {s.excerpt && (
            <p className="whitespace-pre-wrap border-t border-slate-100 px-3 py-2 text-slate-600">
              {s.excerpt}
              {s.excerpt.length >= 280 ? "…" : ""}
            </p>
          )}
        </details>
      ))}
    </div>
  );
}

export default function ChatConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [title, setTitle] = useState("Conversation");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tempCounter = useRef(0);

  useEffect(() => {
    apiFetch<{ conversation: { title: string }; messages: Message[] }>(
      `/api/chat/conversations/${params.id}`
    )
      .then((data) => {
        setMessages(data.messages);
        setTitle(data.conversation.title);
      })
      .catch((err) => {
        setMessages([]);
        setError(err instanceof ApiError ? err.message : "Conversation not found.");
      });
  }, [params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(question: string) {
    if (!question || sending) return;
    setInput("");
    setError(null);
    setSending(true);
    const tempId = `temp-${++tempCounter.current}`;
    setMessages((prev) => [
      ...(prev ?? []),
      { id: tempId, role: "user", content: question, sources: [], created_at: "" },
    ]);

    try {
      const { userMessage, message } = await apiFetch<{ userMessage: Message; message: Message }>(
        `/api/chat/conversations/${params.id}/messages`,
        { method: "POST", body: JSON.stringify({ question }) }
      );
      setMessages((prev) => [...(prev ?? []).filter((m) => m.id !== tempId), userMessage, message]);
      if (title === "New conversation") setTitle(question.slice(0, 80));
    } catch (err) {
      // Nothing was saved server-side; restore the question so it can be resent.
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setInput(question);
      setError(err instanceof ApiError ? err.message : "Failed to get a response.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this conversation?")) return;
    try {
      await apiFetch(`/api/chat/conversations/${params.id}`, { method: "DELETE" });
      router.push("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete conversation.");
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col md:h-[calc(100vh-4rem)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/chat" className="text-xs text-slate-500 hover:underline">
            ← All conversations
          </Link>
          <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
        </div>
        <button onClick={handleDelete} className="shrink-0 text-sm text-red-600 hover:underline">
          Delete
        </button>
      </div>

      <div className="card flex-1 space-y-5 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {messages === null && <LoadingBlock label="Loading conversation…" />}
        {messages?.length === 0 && !error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-500">
              Ask a question about your uploaded documents. Answers cite their sources.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="btn-secondary text-xs">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className="max-w-[85%] sm:max-w-2xl">
              <div
                className={
                  m.role === "user"
                    ? "whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-brand-500 px-4 py-2 text-sm text-white"
                    : "whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2 text-sm text-slate-800"
                }
              >
                {m.content}
              </div>
              {m.role === "assistant" && m.sources?.length > 0 && <SourceList sources={m.sources} />}
              {m.role === "assistant" && m.latency_ms ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Answered in {(m.latency_ms / 1000).toFixed(1)}s · local AI
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2 text-sm text-slate-500">
              <Spinner /> Searching your documents and writing an answer…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input.trim());
        }}
        className="mt-4 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          className="input max-h-40 min-h-[2.5rem] resize-y"
          rows={1}
          placeholder="Ask a question about your documents…"
          aria-label="Your question"
          maxLength={2000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input.trim());
            }
          }}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()} className="btn-primary">
          {sending ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}
