"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export default function ChatIndexPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch<{ conversations: Conversation[] }>("/api/chat/conversations").then((data) =>
      setConversations(data.conversations)
    );
  }, []);

  async function startNewChat() {
    setCreating(true);
    try {
      const { conversation } = await apiFetch<{ conversation: { id: string } }>(
        "/api/chat/conversations",
        { method: "POST", body: JSON.stringify({}) }
      );
      router.push(`/chat/${conversation.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">AI Chat</h1>
          <p className="text-sm text-slate-500">Ask questions about your uploaded knowledge.</p>
        </div>
        <button onClick={startNewChat} disabled={creating} className="btn-primary">
          {creating ? "Starting…" : "New conversation"}
        </button>
      </div>

      <div className="card divide-y divide-slate-100">
        {conversations.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No conversations yet. Start one to ask your first question.
          </p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/chat/${c.id}`)}
              className="block w-full px-4 py-3 text-left hover:bg-slate-50"
            >
              <p className="font-medium text-slate-800">{c.title}</p>
              <p className="text-xs text-slate-400">
                {new Date(c.updated_at).toLocaleString()}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
