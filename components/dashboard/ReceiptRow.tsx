import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";

export function ReceiptRow({ t, isNew }: { t: Transaction; isNew?: boolean }) {
  return (
    <div className={`card-hover overflow-hidden rounded-md border border-line bg-white ${isNew ? "pop-in" : ""}`}>
      <div className="flex items-start justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-ink">{t.leverancier}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {formatDate(t.factuurdatum)} · {t.categorie}
          </div>
          {t.risico_toelichting && (
            <div className="mt-1 text-[11px] leading-relaxed text-muted">{t.risico_toelichting}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-sm font-semibold text-ink">
            {t.type === "omzet" ? "+" : "−"}
            {formatCurrency(t.bedrag_incl_btw)}
          </div>
          <div className="mt-1.5">
            <StatusBadge risico={t.risico} />
          </div>
        </div>
      </div>
    </div>
  );
}
