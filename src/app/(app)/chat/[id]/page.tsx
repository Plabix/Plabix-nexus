"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";

interface Source {
  documentId: string;
  documentName: string;
  similarity: number;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Source[];
  created_at: string;
}

export default function ChatConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ messages: Message[] }>(`/api/chat/conversations/${params.id}`)
      .then((data) => setMessages(data.messages))
      .catch(() => setError("Conversation not found."));
  }, [params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const question = input.trim();
    setInput("");
    setError(null);
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, role: "user", content: question, sources: [], created_at: "" },
    ]);

    try {
      const { message } = await apiFetch<{ message: Message }>(
        `/api/chat/conversations/${params.id}/messages`,
        { method: "POST", body: JSON.stringify({ question }) }
      );
      setMessages((prev) => [...prev, message]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get a response.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this conversation?")) return;
    await apiFetch(`/api/chat/conversations/${params.id}`, { method: "DELETE" });
    router.push("/chat");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Conversation</h1>
        <button onClick={handleDelete} className="text-sm text-red-600 hover:underline">
          Delete conversation
        </button>
      </div>

      <div className="card flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Ask a question about your uploaded documents.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={
                m.role === "user"
                  ? "inline-block max-w-lg rounded-2xl rounded-tr-sm bg-brand-500 px-4 py-2 text-left text-sm text-white"
                  : "inline-block max-w-lg rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2 text-left text-sm text-slate-800"
              }
            >
              {m.content}
            </div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">
                Sources: {m.sources.map((s) => s.documentName).join(", ")}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          className="input"
          placeholder="Ask a question about your documents…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending} className="btn-primary">
          {sending ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}
