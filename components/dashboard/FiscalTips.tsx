"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Lightbulb, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TIP_DISCLAIMER } from "@/components/ui/Disclaimer";
import { formatDate } from "@/lib/format";
import type { AiTip } from "@/lib/types";

export function FiscalTips({ tips }: { tips: AiTip[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tips/generate", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Tips konden niet worden gegenereerd.");
        return;
      }
      router.refresh();
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

      {loading && (
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

      {!loading && tips.length > 0 && (
        <ul className="space-y-3">
          {tips.map((tip) => (
            <li key={tip.id} className="flex gap-2.5 border-b border-line pb-3 text-[13px] leading-relaxed last:border-b-0">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-warn" />
              <div>
                <p className="text-ink">{tip.tip_tekst}</p>
                <p className="mt-1 text-[11px] text-muted">{formatDate(tip.gegenereerd_op)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
        {TIP_DISCLAIMER}
      </p>
    </Card>
  );
}
