"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";

export interface TransactionWithDoc extends Transaction {
  documents: { file_url: string } | null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-[13px] last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

export function TransactionDetailModal({ transaction, onClose }: { transaction: TransactionWithDoc; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const path = transaction.documents?.file_url;
    if (!path) return;
    const supabase = createClient();
    supabase.storage
      .from("documents")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setImageUrl(data?.signedUrl ?? null));
  }, [transaction.documents?.file_url]);

  const isPdf = transaction.documents?.file_url?.toLowerCase().endsWith(".pdf");

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-ink/50 sm:items-center sm:justify-center sm:p-4">
      <div className="pop-in safe-bottom safe-top flex h-full w-full flex-col overflow-y-auto bg-paper p-5 sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-lg sm:border sm:border-line">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="display text-lg font-semibold">Factuurdetails</h2>
          <button onClick={onClose} className="-m-2 min-h-11 min-w-11 p-2 text-muted" aria-label="Sluiten">
            <X size={18} />
          </button>
        </div>

        {imageUrl && (
          <div className="mb-4 overflow-hidden rounded-md border border-line bg-white">
            {isPdf ? (
              <iframe src={imageUrl} className="h-64 w-full" title="Factuur" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Originele scan" className="w-full object-contain" />
            )}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <span className={`mono text-lg font-semibold ${transaction.type === "omzet" ? "text-ok" : "text-ink"}`}>
            {transaction.type === "omzet" ? "+" : "−"}
            {formatCurrency(transaction.bedrag_incl_btw)}
          </span>
          <StatusBadge risico={transaction.risico} />
        </div>

        <div className="rounded-md border border-line bg-paper-dark px-3.5">
          <Row label={transaction.type === "omzet" ? "Klant" : "Leverancier"} value={transaction.leverancier} />
          <Row label="Datum" value={formatDate(transaction.factuurdatum)} />
          <Row label="Factuurnummer" value={transaction.factuurnummer} />
          <Row label="Categorie" value={transaction.categorie} />
          <Row label="Bedrag excl. BTW" value={formatCurrency(transaction.bedrag_excl_btw)} />
          <Row label="BTW-bedrag" value={formatCurrency(transaction.btw_bedrag)} />
          <Row label="BTW-percentage" value={`${transaction.btw_percentage}%`} />
          <Row label="Invoerwijze" value={transaction.invoerwijze === "ai" ? "AI-scan" : "Handmatig"} />
        </div>

        {transaction.omschrijving && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-ink">Omschrijving</p>
            <p className="text-[13px] leading-relaxed text-muted">{transaction.omschrijving}</p>
          </div>
        )}

        {transaction.risico_toelichting && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-ink">AI-toelichting</p>
            <p className="text-[13px] leading-relaxed text-muted">{transaction.risico_toelichting}</p>
          </div>
        )}
      </div>
    </div>
  );
}
