"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { AmountFields } from "@/components/documents/AmountFields";
import { CATEGORIE_OPTIES } from "@/lib/types";
import { saveTransaction } from "@/lib/transactions";
import type { TransactieType } from "@/lib/types";

export function ManualEntryModal({
  userId,
  defaultBtwPercentage,
  onClose,
  onSaved,
}: {
  userId: string;
  defaultBtwPercentage: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [bedragInclBtw, setBedragInclBtw] = useState("");
  const [btwPercentage, setBtwPercentage] = useState(defaultBtwPercentage);
  const [leverancier, setLeverancier] = useState("");
  const [factuurdatum, setFactuurdatum] = useState(new Date().toISOString().slice(0, 10));
  const [factuurnummer, setFactuurnummer] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [type, setType] = useState<TransactieType>("kosten");
  const [categorie, setCategorie] = useState<string>(CATEGORIE_OPTIES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!bedragInclBtw || Number(bedragInclBtw) <= 0) {
      setError("Vul een geldig totaalbedrag in.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error: saveError } = await saveTransaction(userId, {
      document_id: null,
      factuurnummer: factuurnummer || null,
      factuurdatum,
      leverancier: leverancier || (type === "omzet" ? "Klant" : "Onbekende leverancier"),
      omschrijving: omschrijving || null,
      bedrag_incl_btw: Number(bedragInclBtw),
      btw_percentage: btwPercentage,
      type,
      categorie,
      risico: "laag",
      risico_toelichting: null,
      invoerwijze: "handmatig",
    });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onSaved(`Handmatig toegevoegd — ${type === "omzet" ? "+" : "−"}€${Number(bedragInclBtw).toFixed(2)}`);
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-ink/50 sm:items-center sm:justify-center sm:p-4">
      <div className="pop-in flex h-full w-full flex-col overflow-y-auto bg-paper px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-lg sm:border sm:border-line">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="display text-lg font-semibold">Handmatig toevoegen</h2>
          <button onClick={onClose} className="-m-2 min-h-11 min-w-11 p-2 text-muted" aria-label="Sluiten">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-[12.5px] text-muted">
          Vul alleen het totaalbedrag en BTW-percentage in — de rest berekenen we automatisch.
        </p>

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

        <AmountFields
          bedragInclBtw={bedragInclBtw}
          btwPercentage={btwPercentage}
          onBedragChange={setBedragInclBtw}
          onPercentageChange={setBtwPercentage}
        />

        <Field label={`${type === "omzet" ? "Klant" : "Leverancier"} (optioneel)`}>
          <Input value={leverancier} onChange={(e) => setLeverancier(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <Input type="date" value={factuurdatum} onChange={(e) => setFactuurdatum(e.target.value)} />
          </Field>
          <Field label="Factuurnummer (optioneel)">
            <Input value={factuurnummer} onChange={(e) => setFactuurnummer(e.target.value)} />
          </Field>
        </div>

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

        <Field label="Omschrijving (reden van kosten) (optioneel)">
          <Textarea
            rows={2}
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            placeholder="Bijv. nieuwe laptop voor kantoor — handig om later terug te lezen waarom je dit hebt gekocht"
          />
        </Field>

        {error && <p className="mb-3 text-sm text-stamp">{error}</p>}

        <Button type="button" onClick={handleSave} loading={saving} className="mt-1 w-full justify-center">
          <Check size={15} />
          Opslaan
        </Button>
      </div>
    </div>
  );
}
