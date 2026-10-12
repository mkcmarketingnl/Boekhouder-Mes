"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { bewaarKlant, verwijderKlant } from "@/lib/actions/klanten";
import { LANDEN } from "@/lib/facturen";
import type { Klant, KlantInvoer } from "@/lib/klantenDb";

const LEEG: KlantInvoer = { naam: "", adres: "", postcode: "", plaats: "", land: "Nederland", btw_nummer: "", kvk: "", email: "" };

const naarInvoer = (k: Klant): KlantInvoer => ({
  naam: k.naam,
  adres: k.adres ?? "",
  postcode: k.postcode ?? "",
  plaats: k.plaats ?? "",
  land: k.land,
  btw_nummer: k.btw_nummer ?? "",
  kvk: k.kvk ?? "",
  email: k.email ?? "",
});

function KlantFormulier({ start, id, onKlaar }: { start: KlantInvoer; id?: string; onKlaar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(start);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const zet = (k: keyof KlantInvoer, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    const res = await bewaarKlant(f, id);
    setBezig(false);
    if (res.fout) {
      setFout(res.fout);
      return;
    }
    router.refresh();
    onKlaar();
  }

  return (
    <form onSubmit={opslaan} className="mt-3 border-t border-line pt-4">
      <Field label="Naam">
        <Input value={f.naam} onChange={(e) => zet("naam", e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Straat en huisnummer">
        <Input value={f.adres} onChange={(e) => zet("adres", e.target.value)} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-[8rem_1fr]">
        <Field label="Postcode">
          <Input value={f.postcode} onChange={(e) => zet("postcode", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Plaats">
          <Input value={f.plaats} onChange={(e) => zet("plaats", e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Field label="Land">
        <Select value={f.land} onChange={(e) => zet("land", e.target.value)}>
          {LANDEN.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <Field label="BTW-nummer (optioneel)">
          <Input value={f.btw_nummer} onChange={(e) => zet("btw_nummer", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="KVK-nummer (optioneel)">
          <Input value={f.kvk} onChange={(e) => zet("kvk", e.target.value)} inputMode="numeric" autoComplete="off" />
        </Field>
      </div>
      <Field label="E-mailadres (optioneel)">
        <Input type="email" value={f.email} onChange={(e) => zet("email", e.target.value)} autoComplete="off" />
      </Field>
      {fout && (
        <p className="mb-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {fout}
        </p>
      )}
      <div className="flex flex-col gap-2 min-[480px]:flex-row">
        <Button type="submit" loading={bezig} className="justify-center">
          Opslaan
        </Button>
        <Button type="button" variant="ghost" onClick={onKlaar} disabled={bezig} className="justify-center">
          Annuleren
        </Button>
      </div>
    </form>
  );
}

export function KlantenBeheer({ klanten }: { klanten: Klant[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | "nieuw" | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  async function verwijder(k: Klant) {
    if (!window.confirm(`${k.naam} verwijderen uit je klantenlijst? Bestaande facturen blijven ongewijzigd.`)) return;
    setMelding(null);
    const res = await verwijderKlant(k.id);
    if (res.fout) {
      setMelding(res.fout);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {melding && (
        <p className="rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {melding}
        </p>
      )}

      {open === "nieuw" ? (
        <Card className="p-5">
          <h2 className="display text-[15px] font-semibold">Nieuwe klant</h2>
          <KlantFormulier start={LEEG} onKlaar={() => setOpen(null)} />
        </Card>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen("nieuw")} className="w-full justify-center min-[480px]:w-auto">
          <Plus size={15} /> Klant toevoegen
        </Button>
      )}

      {klanten.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[14px] font-medium">Nog geen klanten</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">Klanten worden vanzelf bewaard zodra je een factuur opslaat. Je kunt ze hier ook zelf toevoegen.</p>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {klanten.map((k) => (
            <li key={k.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{k.naam}</div>
                    <div className="mt-0.5 text-[12px] text-muted">{[k.adres, [k.postcode, k.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Geen adres"}</div>
                    {k.email && <div className="text-[12px] text-muted">{k.email}</div>}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 min-[480px]:w-auto">
                    <Link href={`/facturen/nieuw?klant=${k.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-ink px-3 text-[13px] font-semibold text-paper hover:opacity-90">
                      <FilePlus2 size={14} /> Factuur maken
                    </Link>
                    <button type="button" onClick={() => setOpen(open === k.id ? null : k.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-medium hover:bg-paper-dark" aria-expanded={open === k.id}>
                      <Pencil size={13} /> Aanpassen
                    </button>
                    <button type="button" onClick={() => verwijder(k)} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[12.5px] text-muted hover:text-stamp" aria-label={`Verwijder ${k.naam}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {open === k.id && <KlantFormulier start={naarInvoer(k)} id={k.id} onKlaar={() => setOpen(null)} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
