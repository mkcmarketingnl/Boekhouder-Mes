"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/format";
import { deleteTransaction } from "@/lib/transactions";
import type { Transaction } from "@/lib/types";

export function ReceiptRow({ t, isNew }: { t: Transaction; isNew?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const { error } = await deleteTransaction(t.id);
    setDeleting(false);
    if (!error) {
      router.refresh();
    }
  }

  if (confirming) {
    return (
      <div className="slide-down overflow-hidden rounded-md border border-stamp/30 bg-stamp-bg">
        <div className="flex items-start gap-2.5 p-3.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-stamp" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-relaxed text-ink">
              <strong>{t.leverancier}</strong> ({formatCurrency(t.bedrag_incl_btw)}) definitief verwijderen? Dit
              kan niet ongedaan worden gemaakt.
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button type="button" variant="danger" onClick={handleDelete} loading={deleting}>
                <Trash2 size={14} />
                Verwijderen
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                Annuleren
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`card-hover group overflow-hidden rounded-md border border-line bg-white ${isNew ? "pop-in" : ""}`}>
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
        <div className="flex shrink-0 items-start gap-1.5">
          <div className="text-right">
            <div className="mono text-sm font-semibold text-ink">
              {t.type === "omzet" ? "+" : "−"}
              {formatCurrency(t.bedrag_incl_btw)}
            </div>
            <div className="mt-1.5">
              <StatusBadge risico={t.risico} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Verwijderen"
            className="-mr-1.5 -mt-1 flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
