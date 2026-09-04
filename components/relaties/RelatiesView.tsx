"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DocumentsList } from "@/components/dashboard/DocumentsList";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RelatieSamenvatting } from "@/lib/finance";
import type { TransactionWithDoc } from "@/components/dashboard/TransactionDetailModal";

export function RelatiesView({
  klanten,
  leveranciers,
  transactiesPerRelatie,
}: {
  klanten: RelatieSamenvatting[];
  leveranciers: RelatieSamenvatting[];
  transactiesPerRelatie: Record<string, TransactionWithDoc[]>;
}) {
  const [tab, setTab] = useState<"klanten" | "leveranciers">("leveranciers");
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);

  const rows = tab === "klanten" ? klanten : leveranciers;

  return (
    <div>
      <div className="mb-5 inline-flex rounded-full border border-line bg-white p-1">
        {(["leveranciers", "klanten"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setGeselecteerd(null);
            }}
            className={cn(
              "min-h-9 rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize leading-6",
              tab === t ? "bg-ink text-paper" : "text-muted"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">
          Nog geen {tab} bekend.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.sleutel}>
              <button
                type="button"
                onClick={() => setGeselecteerd(geselecteerd === r.sleutel ? null : r.sleutel)}
                className="card-hover w-full text-left"
              >
                <Card className="flex items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{r.naam}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {r.aantal} {r.aantal === 1 ? "factuur" : "facturen"} · laatst {formatDate(r.laatsteDatum)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="mono text-sm font-semibold text-ink">{formatCurrency(r.totaal)}</span>
                    <ChevronRight
                      size={16}
                      className={cn("text-muted transition-transform", geselecteerd === r.sleutel && "rotate-90")}
                    />
                  </div>
                </Card>
              </button>

              {geselecteerd === r.sleutel && (
                <div className="slide-down mt-2.5 pl-2">
                  <DocumentsList rows={transactiesPerRelatie[r.sleutel] ?? []} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
