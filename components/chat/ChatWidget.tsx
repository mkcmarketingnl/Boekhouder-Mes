"use client";

import { useState } from "react";
import { MessageCircle, X, ArrowLeft } from "lucide-react";
import { ConversationList } from "@/components/chat/ConversationList";
import { MessageThread } from "@/components/chat/MessageThread";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "thread">("list");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  function openNewConversation() {
    setActiveConversationId(null);
    setView("thread");
  }

  function selectConversation(id: string) {
    setActiveConversationId(id);
    setView("thread");
  }

  function backToList() {
    setView("list");
    setListRefreshKey((k) => k + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setView("list");
        }}
        className="btn-press fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-lg"
        aria-label="Open chat met Mes"
      >
        <MessageCircle size={22} />
      </button>

      {open && (
        <div className="fade-in fixed inset-0 z-50 flex items-end bg-ink/50 sm:items-center sm:justify-center sm:p-4">
          <div className="pop-in flex h-full w-full flex-col overflow-hidden bg-paper px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:h-[85vh] sm:max-h-[700px] sm:max-w-md sm:rounded-lg sm:border sm:border-line">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {view === "thread" && (
                  <button onClick={backToList} className="-ml-2 flex min-h-11 min-w-11 items-center justify-center text-muted" aria-label="Terug">
                    <ArrowLeft size={18} />
                  </button>
                )}
                <h2 className="display text-lg font-semibold">Mes</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="-m-2 flex min-h-11 min-w-11 items-center justify-center p-2 text-muted"
                aria-label="Sluiten"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {view === "list" ? (
                <ConversationList onSelect={selectConversation} onNew={openNewConversation} refreshKey={listRefreshKey} />
              ) : (
                <MessageThread
                  conversationId={activeConversationId}
                  onConversationCreated={(id) => setActiveConversationId(id)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
