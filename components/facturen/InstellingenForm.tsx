"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { bewaarInstellingen } from "@/lib/actions/facturen";
import { LANDEN, TEMPLATES, formatFactuurnummer, isGeldigeIban, type FactuurTemplate } from "@/lib/facturen";

export interface InstellingenStart {
  bedrijfsnaam: string;
  adres: string;
  postcode: string;
  plaats: string;
  land: string;
  iban: string;
  bic: string;
  telefoon: string;
  email: string;
  website: string;
  kvk_nummer: string;
  btw_nummer: string;
  betaaltermijn_dagen: number;
  factuurnummer_prefix: string;
  volgend_factuurnummer: number;
  standaard_template: FactuurTemplate;
  standaard_notitie: string;
  kor: boolean;
}

export function InstellingenForm({ start, terugNaar }: { start: InstellingenStart; terugNaar: string }) {
  const router = useRouter();
  const [f, setF] = useState(start);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const zet = <K extends keyof InstellingenStart>(k: K, v: InstellingenStart[K]) => setF((x) => ({ ...x, [k]: v }));

  const ibanFout = f.iban.trim() && !isGeldigeIban(f.iban) ? "Dit IBAN lijkt niet te kloppen. Controleer het nog even." : null;

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (ibanFout) {
      setFout(ibanFout);
      return;
    }
    setBezig(true);
    const res = await bewaarInstellingen({ ...f });
    setBezig(false);
    if (res.fout) {
      setFout(res.fout);
      return;
    }
    router.push(terugNaar);
    router.refresh();
  }

  return (
    <form onSubmit={opslaan} className="space-y-5">
      <Card className="p-5">
        <h2 className="display mb-1 text-[15px] font-semibold">Jouw bedrijfsgegevens</h2>
        <p className="mb-4 text-[12.5px] text-muted">Deze komen op elke factuur te staan. Je vult ze één keer in.</p>
        <Field label="Bedrijfsnaam" hint="Pas je naam aan via je account als die niet klopt.">
          <Input value={f.bedrijfsnaam} disabled />
        </Field>
        <Field label="Straat en huisnummer">
          <Input value={f.adres} onChange={(e) => zet("adres", e.target.value)} autoComplete="street-address" />
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-[8rem_1fr]">
          <Field label="Postcode">
            <Input value={f.postcode} onChange={(e) => zet("postcode", e.target.value)} autoComplete="postal-code" />
          </Field>
          <Field label="Plaats">
            <Input value={f.plaats} onChange={(e) => zet("plaats", e.target.value)} autoComplete="address-level2" />
          </Field>
        </div>
        <Field label="Land">
          <Select value={f.land} onChange={(e) => zet("land", e.target.value)}>
            {LANDEN.filter((l) => l !== "Buiten de EU").map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="KVK-nummer">
            <Input value={f.kvk_nummer} onChange={(e) => zet("kvk_nummer", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="BTW-nummer" hint="Bijv. NL123456789B01. Niet nodig als je de KOR gebruikt.">
            <Input value={f.btw_nummer} onChange={(e) => zet("btw_nummer", e.target.value)} />
          </Field>
        </div>
        <Field label="IBAN" hint={ibanFout ?? "Hier moeten je klanten naartoe betalen."}>
          <Input value={f.iban} onChange={(e) => zet("iban", e.target.value)} placeholder="NL91 ABNA 0417 1643 00" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="E-mailadres">
            <Input type="email" value={f.email} onChange={(e) => zet("email", e.target.value)} />
          </Field>
          <Field label="Telefoon (optioneel)">
            <Input type="tel" value={f.telefoon} onChange={(e) => zet("telefoon", e.target.value)} />
          </Field>
        </div>
        <Field label="Website (optioneel)">
          <Input value={f.website} onChange={(e) => zet("website", e.target.value)} />
        </Field>
      </Card>

      <Card className="p-5">
        <h2 className="display mb-4 text-[15px] font-semibold">BTW</h2>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px]">
          <input type="checkbox" checked={f.kor} onChange={(e) => zet("kor", e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#211F1C]" />
          <span>
            Ik gebruik de kleineondernemersregeling (KOR)
            <span className="block text-[11.5px] text-muted">Dan reken je geen BTW en staat er automatisch een vermelding op je facturen. Laat uit als je gewoon BTW afdraagt.</span>
          </span>
        </label>
      </Card>

      <Card className="p-5">
        <h2 className="display mb-4 text-[15px] font-semibold">Facturen</h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="Voorvoegsel factuurnummer" hint="Bijv. 2026- geeft 2026-0001. Mag leeg.">
            <Input value={f.factuurnummer_prefix} onChange={(e) => zet("factuurnummer_prefix", e.target.value)} />
          </Field>
          <Field label="Volgende factuurnummer" hint={`Eerstvolgende factuur: ${formatFactuurnummer(f.factuurnummer_prefix, f.volgend_factuurnummer)}`}>
            <Input type="number" inputMode="numeric" min={1} value={f.volgend_factuurnummer} onChange={(e) => zet("volgend_factuurnummer", Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Betaaltermijn (dagen)" hint="Standaard 14 dagen. Je kunt het per factuur aanpassen.">
          <Input type="number" inputMode="numeric" min={0} max={365} value={f.betaaltermijn_dagen} onChange={(e) => zet("betaaltermijn_dagen", Number(e.target.value))} />
        </Field>
        <Field label="Standaard opmerking onderaan (optioneel)">
          <Textarea rows={3} value={f.standaard_notitie} onChange={(e) => zet("standaard_notitie", e.target.value)} placeholder="Bijv. Bedankt voor je opdracht!" />
        </Field>
        <div className="mb-1 text-[12px] font-medium">Standaard uiterlijk</div>
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => zet("standaard_template", t.id)}
              aria-pressed={f.standaard_template === t.id}
              className={`min-h-11 rounded-md border p-3 text-left ${f.standaard_template === t.id ? "border-ink bg-paper-dark" : "border-line bg-white"}`}
            >
              <div className="text-[13px] font-semibold">{t.naam}</div>
              <div className="text-[11.5px] text-muted">{t.omschrijving}</div>
            </button>
          ))}
        </div>
      </Card>

      {fout && (
        <p className="rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {fout}
        </p>
      )}
      <Button type="submit" loading={bezig} className="w-full min-[480px]:w-auto">
        Opslaan
      </Button>
    </form>
  );
}
