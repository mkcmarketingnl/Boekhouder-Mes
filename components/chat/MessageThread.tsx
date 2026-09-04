"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import type { ChatMessage } from "@/lib/types";

const NEW_CONVERSATION_NOTE =
  "Hoi, ik ben Mes! Vraag me gerust of iets fiscaal slim is of aftrekbaar. Even eerlijk: ik ben geen erkende fiscalist — bij een grote of ingewikkelde beslissing raad ik altijd aan het ook met een boekhouder te bespreken.";

export function MessageThread({
  conversationId,
  onConversationCreated,
}: {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(!!conversationId);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(async () => {
      if (!conversationId) {
        if (!cancelled) {
          setMessages([]);
          setLoadingHistory(false);
        }
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setMessages((data ?? []) as ChatMessage[]);
        setLoadingHistory(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    const optimisticMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId ?? "",
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Mes kon niet antwoorden.");
        return;
      }
      if (!conversationId) {
        onConversationCreated(json.conversationId);
      }
      setMessages((prev) => [...prev, json.message as ChatMessage]);
    } catch {
      setError("Mes kon niet antwoorden. Probeer het opnieuw.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pb-3">
        {loadingHistory ? (
          <p className="text-center text-sm text-muted">Laden...</p>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="rounded-md border border-line bg-paper-dark p-3 text-[12.5px] leading-relaxed text-muted">
                {NEW_CONVERSATION_NOTE}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.role === "user" ? "bg-ink text-paper" : "border border-line bg-white text-ink"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </>
        )}
        {sending && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <Loader2 size={13} className="spin" />
            Mes denkt na...
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-stamp">{error}</p>}

      <div className="flex items-end gap-2 border-t border-line pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="Vraag iets aan Mes..."
          className="max-h-28 min-h-11 flex-1 resize-none rounded-md border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <Button type="button" onClick={handleSend} disabled={!input.trim()} loading={sending} className="min-h-11 min-w-11 px-3">
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
