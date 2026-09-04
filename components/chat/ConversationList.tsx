"use client";

import { useEffect, useState } from "react";
import { Plus, MessageCircle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format";
import type { ChatConversation } from "@/lib/types";

export function ConversationList({
  onSelect,
  onNew,
  refreshKey,
}: {
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  refreshKey: number;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("chat_conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) {
          setConversations((data ?? []) as ChatConversation[]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const supabase = createClient();
    await supabase.from("chat_conversations").delete().eq("id", id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="flex h-full flex-col">
      <Button type="button" onClick={onNew} className="mb-4 w-full justify-center">
        <Plus size={15} />
        Nieuw gesprek
      </Button>

      {loading ? (
        <p className="text-center text-sm text-muted">Laden...</p>
      ) : conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted">
          <MessageCircle size={28} className="opacity-40" />
          <p className="text-sm">Nog geen gesprekken met Mes. Stel je eerste vraag!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="card-hover flex items-center justify-between gap-2 rounded-md border border-line bg-white p-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-ink">{c.titel}</p>
                <p className="mt-0.5 text-[11px] text-muted">{formatDate(c.updated_at)}</p>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleDelete(e, c.id)}
                className="-m-2 flex min-h-9 min-w-9 shrink-0 items-center justify-center text-muted hover:text-stamp"
                aria-label="Gesprek verwijderen"
              >
                <Trash2 size={14} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
