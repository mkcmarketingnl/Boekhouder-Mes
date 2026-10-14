"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, Lock, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UrenFormulier, type KlantTarief } from "@/components/uren/UrenFormulier";
import { maakFactuurUitUren, verwijderUren } from "@/lib/actions/uren";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatDuur, formatUren, kwartierUren, openPerKlant, somMinuten, type UrenRegel } from "@/lib/uren";

interface Props {
  periode: UrenRegel[];
  openUren: UrenRegel[];
  klanten: KlantTarief[];
  standaardTarief: number | null;
  vandaag: string;
}

// Een urenregel in de lijst, met bewerken/verwijderen zolang hij niet op een factuur staat.
function Regel({ u, klanten, standaardTarief, vandaag, bezig, onVerwijder }: { u: UrenRegel; klanten: KlantTarief[]; standaardTarief: number | null; vandaag: string; bezig: boolean; onVerwijder: (u: UrenRegel) => void }) {
  const [bewerk, setBewerk] = useState(false);
  if (bewerk) return <UrenFormulier klanten={klanten} standaardTarief={standaardTarief} vandaag={vandaag} bewerk={u} onKlaar={() => setBewerk(false)} />;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-line bg-white p-3">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">
          {u.klant_naam}
          {u.project ? <span className="font-normal text-muted"> · {u.project}</span> : null}
        </div>
        {u.omschrijving && <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{u.omschrijving}</div>}
        <div className="mono mt-1 text-[11.5px] text-muted">
          {u.factureerbaar ? (u.uurtarief != null ? `€ ${String(u.uurtarief).replace(".", ",")}/uur` : "geen uurtarief") : "overig, niet factureerbaar"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="mono text-[14px] font-semibold">{formatDuur(u.minuten)}</div>
        {u.invoice_id ? (
          <Link href={`/facturen/${u.invoice_id}`} className="inline-flex min-h-11 items-center gap-1 text-[11.5px] text-muted underline">
            <Lock size={11} /> Op factuur
          </Link>
        ) : (
          <div className="flex">
            <button type="button" onClick={() => setBewerk(true)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink" aria-label="Uren aanpassen">
              <Pencil size={14} />
            </button>
            <button type="button" onClick={() => onVerwijder(u)} disabled={bezig} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp" aria-label="Uren verwijderen">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Per klant: wat staat er nog open en maak er met één klik een factuurconcept van.
function OpenUrenKaart({ klantNaam, uren }: { klantNaam: string; uren: UrenRegel[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gekozen, setGekozen] = useState<Set<string>>(() => new Set(uren.filter((u) => u.uurtarief != null).map((u) => u.id)));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const geselecteerd = uren.filter((u) => gekozen.has(u.id));
  const minuten = somMinuten(geselecteerd);
  const bedrag = geselecteerd.reduce((a, u) => a + (u.uurtarief != null ? kwartierUren(u.minuten) * u.uurtarief : 0), 0);

  function wissel(id: string) {
    setGekozen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function maak() {
    setBezig(true);
    setFout(null);
    const res = await maakFactuurUitUren(klantNaam, [...gekozen]);
    if (res.fout || !res.id) {
      setBezig(false);
      setFout(res.fout ?? "Het factuurconcept maken is mislukt.");
      return;
    }
    router.push(`/facturen/${res.id}`);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">{klantNaam}</div>
          <div className="mono text-[12px] text-muted">
            {formatUren(somMinuten(uren) / 60)} · {uren.length} {uren.length === 1 ? "regel" : "regels"} nog te factureren
          </div>
        </div>
        <Button type="button" variant={open ? "ghost" : "secondary"} onClick={() => setOpen((o) => !o)} className="w-full justify-center min-[480px]:w-auto" aria-expanded={open}>
          <FilePlus2 size={14} /> {open ? "Sluiten" : "Factuur maken"}
        </Button>
      </div>
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-[12px] text-muted">Kies welke uren op de factuur komen. De uren worden afgerond op een kwartier, per factuurregel.</p>
          <ul className="space-y-1.5">
            {uren.map((u) => (
              <li key={u.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-1 text-[12.5px]">
                  <input type="checkbox" checked={gekozen.has(u.id)} onChange={() => wissel(u.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#211F1C]" />
                  <span className="min-w-0 flex-1">
                    {formatDate(u.datum)} · {formatDuur(u.minuten)} {u.project ? `· ${u.project}` : ""}
                    {u.omschrijving ? <span className="block truncate text-muted">{u.omschrijving}</span> : null}
                    {u.uurtarief == null && <span className="block text-stamp">Geen uurtarief: pas de regel aan om hem te kunnen factureren.</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mono mt-2 flex justify-between border-t border-line pt-2 text-[12.5px]">
            <span>{formatUren(kwartierUren(minuten))} (afgerond)</span>
            <span>ca. {formatCurrency(bedrag)} excl. BTW</span>
          </div>
          {fout && (
            <p className="mt-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
              {fout}
            </p>
          )}
          <Button type="button" onClick={maak} loading={bezig} disabled={gekozen.size === 0} className="mt-3 w-full justify-center min-[480px]:w-auto">
            Maak factuurconcept van {gekozen.size} {gekozen.size === 1 ? "regel" : "regels"}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function UrenBeheer({ periode, openUren, klanten, standaardTarief, vandaag }: Props) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const perKlant = useMemo(() => openPerKlant(openUren), [openUren]);
  const perDag = useMemo(() => {
    const m = new Map<string, UrenRegel[]>();
    for (const u of periode) m.set(u.datum, [...(m.get(u.datum) ?? []), u]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [periode]);

  async function verwijder(u: UrenRegel) {
    if (!window.confirm(`Deze ${formatDuur(u.minuten)} uur voor ${u.klant_naam} verwijderen?`)) return;
    setBezig(true);
    setMelding(null);
    const res = await verwijderUren(u.id);
    setBezig(false);
    if (res.fout) {
      setMelding(res.fout);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <UrenFormulier klanten={klanten} standaardTarief={standaardTarief} vandaag={vandaag} />

      {perKlant.length > 0 && (
        <section>
          <h2 className="display mb-3 text-[15px] font-semibold">Nog te factureren</h2>
          <div className="space-y-2.5">
            {perKlant.map((k) => {
              const van = openUren.filter((u) => u.klant_naam.trim().toLowerCase() === k.klant_naam.toLowerCase() && u.factureerbaar && !u.invoice_id);
              // De sleutel bevat de regels zelf: komt er een regel bij of gaat er een weg, dan begint de kaart opnieuw met de juiste selectie.
              const sleutel = `${k.klant_naam.toLowerCase()}|${van.map((u) => `${u.id}:${u.minuten}:${u.uurtarief ?? "x"}`).join(",")}`;
              return <OpenUrenKaart key={sleutel} klantNaam={k.klant_naam} uren={van} />;
            })}
          </div>
        </section>
      )}

      {melding && (
        <p className="rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {melding}
        </p>
      )}

      <section className="space-y-4">
        {perDag.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[14px] font-medium">Nog geen uren in deze maand</p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">Voeg hierboven je eerste uren toe.</p>
          </Card>
        ) : (
          perDag.map(([datum, regels]) => (
            <div key={datum}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <h3 className="text-[12.5px] font-medium text-muted">{formatDate(datum)}</h3>
                <span className="mono text-[12px] text-muted">{formatDuur(somMinuten(regels))}</span>
              </div>
              <div className="space-y-2">
                {regels.map((u) => (
                  <Regel key={u.id} u={u} klanten={klanten} standaardTarief={standaardTarief} vandaag={vandaag} bezig={bezig} onVerwijder={verwijder} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
