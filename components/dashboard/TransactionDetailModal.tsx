"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Check, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { AmountFields } from "@/components/documents/AmountFields";
import { formatCurrency, formatDate } from "@/lib/format";
import { CATEGORIE_OPTIES } from "@/lib/types";
import { checkDuplicateFactuur, updateTransaction } from "@/lib/transactions";
import type { Transaction, TransactieType } from "@/lib/types";

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
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [leverancier, setLeverancier] = useState(transaction.leverancier);
  const [factuurnummer, setFactuurnummer] = useState(transaction.factuurnummer ?? "");
  const [factuurdatum, setFactuurdatum] = useState(transaction.factuurdatum);
  const [omschrijving, setOmschrijving] = useState(transaction.omschrijving ?? "");
  const [categorie, setCategorie] = useState(transaction.categorie);
  const [type, setType] = useState<TransactieType>(transaction.type);
  const [bedragInclBtw, setBedragInclBtw] = useState(transaction.bedrag_incl_btw.toString());
  const [btwPercentage, setBtwPercentage] = useState(transaction.btw_percentage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicaatVan, setDuplicaatVan] = useState<Transaction | null>(null);
  const [duplicaatBevestigd, setDuplicaatBevestigd] = useState(false);

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

  async function handleSave() {
    setError(null);

    if (!duplicaatBevestigd) {
      const bestaande = await checkDuplicateFactuur(
        transaction.user_id,
        leverancier,
        factuurnummer,
        transaction.id
      );
      if (bestaande) {
        setDuplicaatVan(bestaande);
        setDuplicaatBevestigd(true);
        return;
      }
    }

    setSaving(true);
    const { error: saveError } = await updateTransaction(transaction.user_id, transaction.id, {
      leverancier,
      factuurnummer: factuurnummer || null,
      factuurdatum,
      omschrijving: omschrijving || null,
      bedrag_incl_btw: Number(bedragInclBtw),
      btw_percentage: btwPercentage,
      type,
      categorie,
    });
    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }
    router.refresh();
    onClose();
  }

  if (editing) {
    return (
      <div className="fade-in fixed inset-0 z-50 flex items-end bg-ink/50 sm:items-center sm:justify-center sm:p-4">
        <div className="pop-in flex h-full w-full flex-col overflow-y-auto bg-paper px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-lg sm:border sm:border-line">
          <div className="mb-3 flex items-start justify-between">
            <h2 className="display text-lg font-semibold">Factuur bewerken</h2>
            <button onClick={onClose} className="-m-2 min-h-11 min-w-11 p-2 text-muted" aria-label="Sluiten">
              <X size={18} />
            </button>
          </div>

          <div className="mb-4 flex gap-2">
            {(["kosten", "omzet"] as TransactieType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`min-h-11 flex-1 rounded-md border text-sm font-semibold capitalize ${
                  type === t ? "border-ink bg-ink text-paper" : "border-line bg-white text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <Field label={type === "omzet" ? "Klant" : "Leverancier"}>
            <Input
              value={leverancier}
              onChange={(e) => {
                setLeverancier(e.target.value);
                setDuplicaatBevestigd(false);
                setDuplicaatVan(null);
              }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum">
              <Input type="date" value={factuurdatum} onChange={(e) => setFactuurdatum(e.target.value)} />
            </Field>
            <Field label="Factuurnummer">
              <Input
                value={factuurnummer}
                onChange={(e) => {
                  setFactuurnummer(e.target.value);
                  setDuplicaatBevestigd(false);
                  setDuplicaatVan(null);
                }}
              />
            </Field>
          </div>

          <AmountFields
            bedragInclBtw={bedragInclBtw}
            btwPercentage={btwPercentage}
            onBedragChange={setBedragInclBtw}
            onPercentageChange={setBtwPercentage}
          />

          {type === "kosten" && (
            <Field label="Categorie">
              <Select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                {CATEGORIE_OPTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Omschrijving">
            <Textarea rows={2} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} />
          </Field>

          {duplicaatVan && (
            <div className="slide-down mb-4 flex gap-2.5 rounded-md border border-warn/30 bg-warn-bg p-3">
              <Copy size={16} className="mt-0.5 shrink-0 text-warn" />
              <div className="text-[12.5px] leading-relaxed text-ink">
                <strong>Dit factuurnummer bestaat al.</strong> {duplicaatVan.leverancier}, opgeslagen op{" "}
                {formatDate(duplicaatVan.factuurdatum)} voor {formatCurrency(duplicaatVan.bedrag_incl_btw)}.
                Weet je zeker dat je dit zo wilt opslaan?
              </div>
            </div>
          )}

          {error && <p className="mb-3 text-sm text-stamp">{error}</p>}

          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Annuleren
            </Button>
            <Button type="button" onClick={handleSave} loading={saving} className="flex-1 justify-center">
              <Check size={15} />
              {duplicaatVan ? "Toch opslaan" : "Opslaan"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-ink/50 sm:items-center sm:justify-center sm:p-4">
      <div className="pop-in flex h-full w-full flex-col overflow-y-auto bg-paper px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-lg sm:border sm:border-line">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="display text-lg font-semibold">Factuurdetails</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              className="-m-2 flex min-h-11 min-w-11 items-center justify-center p-2 text-muted hover:text-ink"
              aria-label="Bewerken"
            >
              <Pencil size={16} />
            </button>
            <button onClick={onClose} className="-m-2 min-h-11 min-w-11 p-2 text-muted" aria-label="Sluiten">
              <X size={18} />
            </button>
          </div>
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

        <Button type="button" variant="secondary" onClick={() => setEditing(true)} className="mt-4 w-full justify-center">
          <Pencil size={14} />
          Bewerken
        </Button>
      </div>
    </div>
  );
}
