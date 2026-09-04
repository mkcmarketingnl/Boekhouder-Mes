"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import type { ChatMessage } from "@/lib/types";

const NEW_CONVERSATION_NOTE =
  "Hoi, ik ben Mes! Vraag me gerust of iets fiscaal slim is of aftrekbaar. Even eerlijk: ik ben geen erkende fiscalist — bij een grote of ingewikkelde beslissing raad ik altijd aan het ook met een boekhouder te bespreken.";

const STREAMING_MESSAGE_ID = "streaming-reply";

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
  const skipNextHistoryFetch = useRef(false);

  useEffect(() => {
    if (skipNextHistoryFetch.current) {
      skipNextHistoryFetch.current = false;
      return;
    }

    let cancelled = false;

    Promise.resolve().then(async () => {
      if (!conversationId) {
        if (!cancelled) {
          setMessages([]);
          setLoadingHistory(false);
        }
        return;
      }
      setLoadingHistory(true);
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

    let activeConversationId = conversationId;
    let streamingText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (!res.body) throw new Error("Geen stream ontvangen.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const eventMatch = rawEvent.match(/^event: (.+)$/m);
          const dataMatch = rawEvent.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const eventName = eventMatch[1];
          const data = JSON.parse(dataMatch[1]);

          if (eventName === "meta") {
            if (!activeConversationId) {
              activeConversationId = data.conversationId;
              skipNextHistoryFetch.current = true;
              onConversationCreated(data.conversationId);
            }
          } else if (eventName === "delta") {
            streamingText += data.text;
            const streamingSnapshot = streamingText;
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== STREAMING_MESSAGE_ID),
              {
                id: STREAMING_MESSAGE_ID,
                conversation_id: activeConversationId ?? "",
                role: "assistant",
                content: streamingSnapshot,
                created_at: new Date().toISOString(),
              },
            ]);
          } else if (eventName === "done") {
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== STREAMING_MESSAGE_ID),
              data.message as ChatMessage,
            ]);
          } else if (eventName === "error") {
            setError(data.error ?? "Mes kon niet antwoorden.");
            setMessages((prev) => prev.filter((m) => m.id !== STREAMING_MESSAGE_ID));
          }
        }
      }
    } catch {
      setError("Mes kon niet antwoorden. Probeer het opnieuw.");
      setMessages((prev) => prev.filter((m) => m.id !== STREAMING_MESSAGE_ID));
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
        {sending && !messages.some((m) => m.id === STREAMING_MESSAGE_ID) && (
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
