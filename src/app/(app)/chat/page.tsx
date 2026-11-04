"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { EmptyState, ErrorBanner, LoadingBlock, PageHeader, timeAgo } from "@/components/ui";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

export default function ChatIndexPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ conversations: Conversation[] }>("/api/chat/conversations")
      .then((data) => setConversations(data.conversations))
      .catch((err) => {
        setConversations([]);
        setError(err instanceof ApiError ? err.message : "Failed to load conversations.");
      });
  }, []);

  async function startNewChat() {
    setCreating(true);
    setError(null);
    try {
      const { conversation } = await apiFetch<{ conversation: { id: string } }>(
        "/api/chat/conversations",
        { method: "POST", body: JSON.stringify({}) }
      );
      router.push(`/chat/${conversation.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start a conversation.");
      setCreating(false);
    }
  }

  const newButton = (
    <button onClick={startNewChat} disabled={creating} className="btn-primary">
      {creating ? "Starting…" : "New conversation"}
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Chat"
        description="Ask questions about your uploaded knowledge. Your conversations are private to you."
        actions={newButton}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="card divide-y divide-slate-100">
        {conversations === null ? (
          <LoadingBlock label="Loading conversations…" />
        ) : conversations.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            description="Start a conversation to ask your first question. Answers are grounded in your documents and cite their sources."
            action={newButton}
          />
        ) : (
          conversations.map((c) => (
            <Link key={c.id} href={`/chat/${c.id}`} className="block px-4 py-3 hover:bg-slate-50">
              <p className="truncate font-medium text-slate-800">{c.title}</p>
              <p className="text-xs text-slate-400">
                {c.message_count} message{c.message_count === 1 ? "" : "s"} · {timeAgo(c.updated_at)}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
