"use client";

import { useState } from "react";
import Link from "next/link";
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
  totaalOmzet,
  totaalKosten,
  jaren,
  gekozenJaar,
}: {
  klanten: RelatieSamenvatting[];
  leveranciers: RelatieSamenvatting[];
  transactiesPerRelatie: Record<string, TransactionWithDoc[]>;
  totaalOmzet: number;
  totaalKosten: number;
  jaren: string[];
  gekozenJaar: string;
}) {
  const [tab, setTab] = useState<"klanten" | "leveranciers">("leveranciers");
  const [geselecteerd, setGeselecteerd] = useState<string | null>(null);

  const rows = tab === "klanten" ? klanten : leveranciers;
  const totaal = tab === "klanten" ? totaalOmzet : totaalKosten;
  const periodeLabel = gekozenJaar === "alle" ? "alle jaren samen" : gekozenJaar;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[...jaren, "alle"].map((j) => (
          <Link
            key={j}
            href={`/relaties?jaar=${j}`}
            className={cn(
              "flex min-h-9 items-center rounded-full border px-3.5 text-sm font-semibold capitalize",
              gekozenJaar === j ? "border-ink bg-ink text-paper" : "border-line bg-white text-muted"
            )}
          >
            {j}
          </Link>
        ))}
      </div>

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

      <Card className="mb-4 flex items-center justify-between gap-3 bg-paper-dark p-3.5">
        <div className="min-w-0">
          <div className="text-[11.5px] uppercase tracking-wide text-muted">
            Totaal {tab === "klanten" ? "omzet" : "kosten"} · {periodeLabel}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">excl. btw — gelijk aan {tab === "klanten" ? "Omzet" : "Kosten"} op je dashboard</div>
        </div>
        <span className="mono shrink-0 text-lg font-semibold text-ink">{formatCurrency(totaal)}</span>
      </Card>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">
          Nog geen {tab} bekend in {periodeLabel}.
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
                    <div className="text-right">
                      <div className="mono text-sm font-semibold text-ink">{formatCurrency(r.totaalExcl)}</div>
                      <div className="mono text-[10.5px] text-muted">{formatCurrency(r.totaalIncl)} incl. btw</div>
                    </div>
                    <ChevronRight
                      size={16}
                      className={cn("text-muted transition-transform", geselecteerd === r.sleutel && "rotate-90")}
                    />
                  </div>
                </Card>
              </button>

              {geselecteerd === r.sleutel && (
                <div className="slide-down mt-2.5 pl-2">
                  <p className="mb-1.5 text-[11px] text-muted">Bedragen hieronder zijn incl. btw, zoals op de factuur.</p>
                  <DocumentsList rows={(transactiesPerRelatie[r.sleutel] ?? []).filter((t) => t.type === (tab === "klanten" ? "omzet" : "kosten"))} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
