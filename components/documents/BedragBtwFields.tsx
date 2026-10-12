"use client";

import { Plus, X } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { formatCurrency } from "@/lib/format";
import { maakRegel } from "@/lib/btw";
import { normaliseerInvoer } from "@/lib/decimal";
import {
  BTW_VOLGORDE,
  bedragenUitWaarde,
  naarEnkel,
  naarGemengd,
  type BedragBtwWaarde,
} from "@/lib/btwInvoer";

// Vervangt AmountFields overal waar een bedrag + BTW wordt ingevoerd. Standaard één tarief (zoals vroeger);
// bij een bon met meerdere BTW-tarieven (bijv. eten 9% en drank 21%) kan de gebruiker per tarief het bedrag
// invullen — de BTW wordt dan per regel berekend en opgeteld, zodat de boekhouding klopt.
export function BedragBtwFields({
  waarde,
  onChange,
  documentTotaal,
}: {
  waarde: BedragBtwWaarde;
  onChange: (w: BedragBtwWaarde) => void;
  // Totaal zoals het op het gescande document staat; alleen voor een waarschuwing bij een afwijking.
  documentTotaal?: number | null;
}) {
  const b = bedragenUitWaarde(waarde);
  const afwijking = documentTotaal != null && b.geldig && Math.abs(b.totaalIncl - documentTotaal) > 0.011;

  if (!waarde.gemengd) {
    return (
      <div className="mb-5 space-y-3">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Field label="Totaalbedrag incl. BTW">
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={waarde.bedragInclBtw.replace(".", ",")}
              onChange={(e) => {
                const n = normaliseerInvoer(e.target.value);
                if (n !== null) onChange({ ...waarde, bedragInclBtw: n });
              }}
              placeholder="0,00"
            />
          </Field>
          <Field label="BTW-percentage">
            <Select
              value={waarde.btwPercentage}
              onChange={(e) => onChange({ ...waarde, btwPercentage: Number(e.target.value) })}
            >
              {BTW_VOLGORDE.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Samenvatting totaalExcl={b.totaalExcl} btw={b.btwTotaal} zichtbaar={b.geldig} />
        {afwijking && <Waarschuwing totaal={documentTotaal as number} berekend={b.totaalIncl} />}

        <button
          type="button"
          onClick={() => onChange(naarGemengd(waarde))}
          className="flex min-h-11 w-full items-center gap-2 rounded-md border border-dashed border-line px-3.5 text-left text-[12.5px] text-muted hover:text-ink"
        >
          <Plus size={14} className="shrink-0" />
          <span>
            Staan er <strong className="font-semibold text-ink">meerdere BTW-tarieven</strong> op dit bonnetje? (bijv. eten
            9% en drinken 21%)
          </span>
        </button>
      </div>
    );
  }

  const gebruikt = new Set(waarde.regels.map((r) => r.percentage));

  function zetRegel(i: number, patch: Partial<{ percentage: number; bedrag: string }>) {
    onChange({ ...waarde, regels: waarde.regels.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  }

  function verwijder(i: number) {
    const rest = waarde.regels.filter((_, j) => j !== i);
    const nieuw = { ...waarde, regels: rest };
    onChange(rest.length < 2 ? naarEnkel(nieuw) : nieuw);
  }

  const vrijeTarieven = BTW_VOLGORDE.filter((p) => !gebruikt.has(p));

  return (
    <div className="mb-5 space-y-3">
      <div className="rounded-md border border-line bg-white p-3.5">
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          Vul per BTW-tarief het bedrag <strong className="font-semibold text-ink">inclusief BTW</strong> in, zoals het op de bon
          staat (bijv. €40 drank bij 21% en €60 eten bij 9%).
        </p>
        <div className="space-y-2.5">
          {waarde.regels.map((r, i) => {
            const regel = maakRegel(r.percentage, Number(r.bedrag) || 0);
            return (
              <div key={i}>
                <div className="grid grid-cols-[6rem_1fr_2.75rem] items-center gap-2">
                  <Select
                    aria-label={`BTW-tarief regel ${i + 1}`}
                    value={r.percentage}
                    onChange={(e) => zetRegel(i, { percentage: Number(e.target.value) })}
                  >
                    {BTW_VOLGORDE.filter((p) => p === r.percentage || !gebruikt.has(p)).map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Bedrag incl. BTW regel ${i + 1}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.bedrag.replace(".", ",")}
                    onChange={(e) => {
                      const n = normaliseerInvoer(e.target.value);
                      if (n !== null) zetRegel(i, { bedrag: n });
                    }}
                    placeholder="Bedrag incl. BTW"
                  />
                  <button
                    type="button"
                    onClick={() => verwijder(i)}
                    aria-label={`Verwijder BTW-regel ${i + 1}`}
                    className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp"
                  >
                    <X size={16} />
                  </button>
                </div>
                {Number(r.bedrag) > 0 && (
                  <p className="mono mt-1 pl-1 text-[11px] text-muted">
                    excl. {formatCurrency(regel.bedrag_excl_btw)} · BTW {formatCurrency(regel.btw_bedrag)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {vrijeTarieven.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange({ ...waarde, regels: [...waarde.regels, { percentage: vrijeTarieven[0], bedrag: "" }] })
            }
            className="mt-3 flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium text-ink underline"
          >
            <Plus size={14} /> Nog een BTW-tarief toevoegen
          </button>
        )}
      </div>

      <div className="rounded-md border border-line bg-paper-dark p-3.5 text-[13px]">
        <div className="mono flex justify-between font-semibold text-ink">
          <span>Totaal incl. BTW</span>
          <span>{b.geldig ? formatCurrency(b.totaalIncl) : "—"}</span>
        </div>
        <div className="mono mt-1.5 flex justify-between text-ink">
          <span>Totaal excl. BTW</span>
          <span>{b.geldig ? formatCurrency(b.totaalExcl) : "—"}</span>
        </div>
        <div className="mono mt-1.5 flex justify-between text-muted">
          <span>Totaal BTW</span>
          <span>{b.geldig ? formatCurrency(b.btwTotaal) : "—"}</span>
        </div>
      </div>
      {afwijking && <Waarschuwing totaal={documentTotaal as number} berekend={b.totaalIncl} />}

      <button
        type="button"
        onClick={() => onChange(naarEnkel(waarde))}
        className="min-h-11 text-[12.5px] text-muted underline"
      >
        Toch maar één BTW-tarief
      </button>
    </div>
  );
}

function Samenvatting({ totaalExcl, btw, zichtbaar }: { totaalExcl: number; btw: number; zichtbaar: boolean }) {
  return (
    <div className="rounded-md border border-line bg-paper-dark p-3.5 text-[13px]">
      <div className="mono flex justify-between text-ink">
        <span>Bedrag excl. BTW</span>
        <span>{zichtbaar ? formatCurrency(totaalExcl) : "—"}</span>
      </div>
      <div className="mono mt-1.5 flex justify-between text-muted">
        <span>BTW-bedrag</span>
        <span>{zichtbaar ? formatCurrency(btw) : "—"}</span>
      </div>
    </div>
  );
}

function Waarschuwing({ totaal, berekend }: { totaal: number; berekend: number }) {
  return (
    <p className="rounded-md border border-warn/30 bg-warn-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink">
      <strong>Let op:</strong> op het document staat een totaal van {formatCurrency(totaal)}, maar hier staat{" "}
      {formatCurrency(berekend)}. Klopt dit zo?
    </p>
  );
}
