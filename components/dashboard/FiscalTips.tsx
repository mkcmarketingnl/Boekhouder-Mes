"use client";

import { useState } from "react";
import { Sparkles, Lightbulb, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TIP_DISCLAIMER } from "@/components/ui/Disclaimer";
import { formatDate } from "@/lib/format";
import type { AiTip } from "@/lib/types";

export function FiscalTips() {
  const [tips, setTips] = useState<AiTip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setTips([]);
    let reachedEnd = false;
    let streamingIndex = 0;

    try {
      const res = await fetch("/api/tips/generate", { method: "POST" });
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

          if (eventName === "tip") {
            streamingIndex += 1;
            setTips((prev) => [
              ...prev,
              {
                id: `streaming-${streamingIndex}`,
                user_id: "",
                gegenereerd_op: new Date().toISOString(),
                tip_tekst: data.text,
                context_snapshot: null,
              },
            ]);
          } else if (eventName === "done") {
            reachedEnd = true;
            setTips((data.data ?? []) as AiTip[]);
          } else if (eventName === "error") {
            reachedEnd = true;
            setError(data.error ?? "Tips konden niet worden gegenereerd.");
            setTips([]);
          }
        }
      }

      if (!reachedEnd) {
        throw new Error("Stream eindigde onverwacht.");
      }
    } catch {
      setError((prev) => prev ?? "Tips konden niet worden gegenereerd. Probeer het later opnieuw.");
      setTips((prev) => (prev.length > 0 && prev[0]?.user_id === "" ? [] : prev));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-stamp" />
          <h2 className="display text-[15px] font-semibold">Fiscale tips</h2>
        </div>
        <Button type="button" variant="secondary" onClick={generate} loading={loading} className="text-xs">
          {loading ? "Bezig..." : "Genereer tips"}
        </Button>
      </div>

      {loading && tips.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] text-ink">
          <Loader2 size={14} className="spin" />
          Je cijfers worden geanalyseerd...
        </div>
      )}

      {error && <p className="text-sm text-stamp">{error}</p>}

      {!loading && tips.length === 0 && !error && (
        <p className="text-[13px] text-muted">
          Nog geen tips gegenereerd. Klik op &ldquo;Genereer tips&rdquo; voor persoonlijke, simpel
          uitgelegde fiscale suggesties op basis van je huidige cijfers.
        </p>
      )}

      {tips.length > 0 && (
        <ul className="space-y-3">
          {tips.map((tip) => (
            <li key={tip.id} className="slide-down flex gap-2.5 border-b border-line pb-3 text-[13px] leading-relaxed last:border-b-0">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-warn" />
              <div>
                <p className="text-ink">{tip.tip_tekst}</p>
                {tip.user_id && <p className="mt-1 text-[11px] text-muted">{formatDate(tip.gegenereerd_op)}</p>}
              </div>
            </li>
          ))}
          {loading && (
            <li className="flex items-center gap-2 text-[12px] text-muted">
              <Loader2 size={12} className="spin" />
              Nog een tip onderweg...
            </li>
          )}
        </ul>
      )}

      <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
        {TIP_DISCLAIMER}
      </p>
    </Card>
  );
}
