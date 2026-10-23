"use client";

import { Plus, X } from "lucide-react";
import { Input, Select } from "@/components/ui/Input";
import { normaliseerInvoer } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { BTW_VOLGORDE } from "@/lib/btwInvoer";
import { maakVolledig, nettoNaVerrekening, type VerrekendeKost } from "@/lib/verrekend";

// Eén bewerkbare regel: het bedrag staat als tekst (met punt als decimaalteken) zodat typen met komma gewoon werkt.
export interface KostRegel {
  omschrijving: string;
  partij: string | null;
  referentie: string | null;
  bedrag: string; // incl. BTW
  percentage: number;
}

export function kostRegelsUitScan(kosten: VerrekendeKost[] | null | undefined): KostRegel[] {
  return (kosten ?? []).map((k) => ({ omschrijving: k.omschrijving, partij: k.partij, referentie: k.referentie, bedrag: String(k.bedrag_incl_btw), percentage: k.btw_percentage }));
}

// Zet de regels om naar volledige bedragen; null als er iets niet klopt (dan blokkeren we het opslaan met een melding).
export function kostenUitRegels(regels: KostRegel[], hoofdTotaal: number): { kosten: VerrekendeKost[]; fout: string | null } {
  const ruw = regels.map((r) => ({ omschrijving: r.omschrijving, partij: r.partij, referentie: r.referentie, bedrag_incl_btw: Number(r.bedrag), btw_percentage: r.percentage }));
  if (ruw.some((r) => !Number.isFinite(r.bedrag_incl_btw) || r.bedrag_incl_btw <= 0)) return { kosten: [], fout: "Vul bij elke ingehouden kost een bedrag in, of verwijder de regel." };
  const { kosten, onleesbaar } = maakVolledig(ruw);
  if (onleesbaar) return { kosten: [], fout: "Een ingehouden kost is niet goed ingevuld." };
  const totaal = kosten.reduce((a, k) => a + Math.round(k.bedrag_incl_btw * 100), 0) / 100;
  if (hoofdTotaal > 0 && totaal >= hoofdTotaal) return { kosten: [], fout: "De ingehouden kosten zijn net zo hoog als het hele factuurbedrag. Controleer de bedragen." };
  return { kosten, fout: null };
}

// Kosten die van het factuurbedrag worden afgehouden (factoring, commissie, platformkosten). We boeken ze als aparte
// kostenpost: de omzet en de BTW over de verkoop blijven het volledige factuurbedrag, en de ingehouden kosten (met hun
// eigen voorbelasting) staan er apart naast. Samen komt dat uit op wat je daadwerkelijk ontvangt.
export function VerrekendeKostenFields({
  regels,
  onChange,
  boeken,
  onBoeken,
  hoofdTotaal,
  eindbedrag,
}: {
  regels: KostRegel[];
  onChange: (r: KostRegel[]) => void;
  boeken: boolean;
  onBoeken: (b: boolean) => void;
  hoofdTotaal: number;
  eindbedrag: number | null | undefined;
}) {
  const { kosten } = kostenUitRegels(regels, hoofdTotaal);
  const netto = kosten.length === regels.length && kosten.length > 0 ? nettoNaVerrekening(hoofdTotaal, kosten) : null;
  const afwijkingMetDocument = netto !== null && eindbedrag != null && Math.abs(netto - eindbedrag) > 0.03;

  function zet(i: number, patch: Partial<KostRegel>) {
    onChange(regels.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="mb-5 rounded-md border border-line bg-white p-3.5">
      <h3 className="mb-1 text-[13px] font-semibold">Ingehouden kosten (bijv. factoring)</h3>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        Worden er op dit document kosten van het factuurbedrag afgehouden? Die boeken we als aparte kostenpost. Je omzet en de BTW over de verkoop blijven zo kloppen, en je ingehouden kosten tellen mee als aftrekpost.
      </p>

      {regels.length > 0 && (
        <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-[12.5px]">
          <input type="checkbox" checked={boeken} onChange={(e) => onBoeken(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#211F1C]" />
          <span>Boek deze kosten ook als kostenpost (aanbevolen)</span>
        </label>
      )}

      <div className="space-y-3">
        {regels.map((r, i) => (
          <div key={i} className="rounded-md border border-line p-2.5">
            <div className="grid grid-cols-[1fr_2.75rem] items-center gap-2">
              <Input aria-label={`Omschrijving ingehouden kost ${i + 1}`} value={r.omschrijving} onChange={(e) => zet(i, { omschrijving: e.target.value })} placeholder="Bijv. Factoring 4,8%" />
              <button type="button" onClick={() => onChange(regels.filter((_, j) => j !== i))} aria-label={`Verwijder ingehouden kost ${i + 1}`} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp">
                <X size={16} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_6rem] gap-2">
              <Input
                aria-label={`Bedrag incl. BTW ingehouden kost ${i + 1}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={r.bedrag.replace(".", ",")}
                onChange={(e) => {
                  const n = normaliseerInvoer(e.target.value);
                  if (n !== null) zet(i, { bedrag: n });
                }}
                placeholder="Bedrag incl. BTW"
              />
              <Select aria-label={`BTW-tarief ingehouden kost ${i + 1}`} value={r.percentage} onChange={(e) => zet(i, { percentage: Number(e.target.value) })}>
                {BTW_VOLGORDE.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...regels, { omschrijving: "Factoring", partij: null, referentie: null, bedrag: "", percentage: 21 }])}
        className="mt-3 flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium text-ink underline"
      >
        <Plus size={14} /> Ingehouden kosten toevoegen
      </button>

      {netto !== null && boeken && (
        <div className="mono mt-3 space-y-0.5 border-t border-line pt-2.5 text-[12px]">
          <div className="flex justify-between">
            <span>Factuurbedrag (omzet)</span>
            <span>{formatCurrency(hoofdTotaal)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>− Ingehouden kosten</span>
            <span>{formatCurrency(hoofdTotaal - netto)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Je ontvangt netto</span>
            <span>{formatCurrency(netto)}</span>
          </div>
        </div>
      )}
      {afwijkingMetDocument && eindbedrag != null && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12px] leading-relaxed">
          Op het document staat een eindbedrag van {formatCurrency(eindbedrag)}, maar met deze bedragen kom je op {formatCurrency(netto ?? 0)}. Controleer de bedragen.
        </p>
      )}
    </div>
  );
}
