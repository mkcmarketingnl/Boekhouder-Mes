"use client";

import { useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { AmountFields } from "@/components/documents/AmountFields";
import { RISK_WARNING_PREFIX, RISK_WARNING_SUFFIX } from "@/components/ui/Disclaimer";
import { CATEGORIE_OPTIES } from "@/lib/types";
import { saveTransaction } from "@/lib/transactions";
import type { ExtractedInvoiceData, RisicoNiveau, TransactieType } from "@/lib/types";

interface Props {
  documentId: string;
  extracted: ExtractedInvoiceData | null;
  userId: string;
  defaultBtwPercentage: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ReviewModal({ documentId, extracted, userId, defaultBtwPercentage, onClose, onSaved }: Props) {
  const [leverancier, setLeverancier] = useState(extracted?.leverancier ?? "");
  const [factuurnummer, setFactuurnummer] = useState(extracted?.factuurnummer ?? "");
  const [factuurdatum, setFactuurdatum] = useState(extracted?.factuurdatum ?? "");
  const [omschrijving, setOmschrijving] = useState(extracted?.omschrijving ?? "");
  const [categorie, setCategorie] = useState<string>(extracted?.voorgestelde_categorie ?? CATEGORIE_OPTIES[0]);
  const [type, setType] = useState<TransactieType>(extracted?.type ?? "kosten");
  const [bedragInclBtw, setBedragInclBtw] = useState(extracted?.bedrag_incl_btw?.toString() ?? "");
  const [btwPercentage, setBtwPercentage] = useState(
    extracted?.btw_percentage ?? defaultBtwPercentage
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const risicovol: RisicoNiveau | null =
    extracted && (extracted.risico === "midden" || extracted.risico === "hoog") ? extracted.risico : null;

  async function handleSave() {
    if (!leverancier.trim() || !factuurdatum || !bedragInclBtw) {
      setError("Vul minimaal leverancier, datum en bedrag in.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error: saveError } = await saveTransaction(userId, {
      document_id: documentId,
      factuurnummer: factuurnummer || null,
      factuurdatum,
      leverancier,
      omschrijving: omschrijving || null,
      bedrag_incl_btw: Number(bedragInclBtw),
      btw_percentage: btwPercentage,
      type,
      categorie,
      risico: extracted?.risico ?? "laag",
      risico_toelichting: extracted?.risico_toelichting ?? null,
      invoerwijze: extracted ? "ai" : "handmatig",
    });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onSaved(`${leverancier} opgeslagen — ${type === "omzet" ? "+" : "−"}€${Number(bedragInclBtw).toFixed(2)}`);
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-ink/50 sm:items-center sm:justify-center sm:p-4">
      <div className="pop-in safe-bottom safe-top flex h-full w-full flex-col overflow-y-auto bg-paper p-5 sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-lg sm:border sm:border-line">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="display text-lg font-semibold">Even checken</h2>
          <button onClick={onClose} className="-m-2 min-h-11 min-w-11 p-2 text-muted" aria-label="Sluiten">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] text-muted">
          {extracted
            ? "Controleer de herkende gegevens en pas aan waar nodig."
            : "De scan is niet gelukt. Vul de gegevens hieronder handmatig in."}
        </p>

        {risicovol && (
          <div className="slide-down mb-4 flex gap-2.5 rounded-md border border-stamp/20 bg-stamp-bg p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-stamp" />
            <div className="text-[12.5px] leading-relaxed text-ink">
              <strong>{RISK_WARNING_PREFIX}</strong> {extracted?.risico_toelichting} {RISK_WARNING_SUFFIX}
            </div>
          </div>
        )}

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
          <Input value={leverancier} onChange={(e) => setLeverancier(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <Input type="date" value={factuurdatum ?? ""} onChange={(e) => setFactuurdatum(e.target.value)} />
          </Field>
          <Field label="Factuurnummer">
            <Input value={factuurnummer ?? ""} onChange={(e) => setFactuurnummer(e.target.value)} />
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
            <Select value={categorie ?? CATEGORIE_OPTIES[0]} onChange={(e) => setCategorie(e.target.value)}>
              {CATEGORIE_OPTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Omschrijving (reden van kosten)">
          <Textarea
            rows={2}
            value={omschrijving ?? ""}
            onChange={(e) => setOmschrijving(e.target.value)}
            placeholder="Waarom heb je dit gekocht? Handig om later terug te lezen."
          />
        </Field>

        {error && <p className="mb-3 text-sm text-stamp">{error}</p>}

        <Button type="button" onClick={handleSave} loading={saving} className="mt-1 w-full justify-center">
          <Check size={15} />
          {risicovol ? "Toch opslaan (op eigen risico)" : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}
