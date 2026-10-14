"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { bewaarUren } from "@/lib/actions/uren";
import { formatDuur, parseDuur, type UrenRegel } from "@/lib/uren";

export interface KlantTarief {
  naam: string;
  uurtarief: number | null;
}

interface Props {
  klanten: KlantTarief[];
  standaardTarief: number | null;
  vandaag: string;
  // Bij bewerken: de urenregel die wordt aangepast
  bewerk?: UrenRegel | null;
  onKlaar?: () => void;
}

export function UrenFormulier({ klanten, standaardTarief, vandaag, bewerk = null, onKlaar }: Props) {
  const router = useRouter();
  const [datum, setDatum] = useState(bewerk?.datum ?? vandaag);
  const [klant, setKlant] = useState(bewerk?.klant_naam ?? "");
  const [project, setProject] = useState(bewerk?.project ?? "");
  const [omschrijving, setOmschrijving] = useState(bewerk?.omschrijving ?? "");
  const [duur, setDuur] = useState(bewerk ? formatDuur(bewerk.minuten) : "");
  const [factureerbaar, setFactureerbaar] = useState(bewerk?.factureerbaar ?? true);
  const [tarief, setTarief] = useState<number>(bewerk?.uurtarief ?? 0);
  const [tariefAangeraakt, setTariefAangeraakt] = useState(!!bewerk);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState(false);

  const minuten = parseDuur(duur);
  const duurHint =
    duur.trim() === "" ? "Typ bijvoorbeeld 3,5 of 3:30." : minuten === null ? "Dit snap ik niet. Probeer 3,5 of 3:30." : `= ${formatDuur(minuten)} uur (${minuten} minuten)`;

  function kiesKlant(naam: string) {
    setKlant(naam);
    const bekend = klanten.find((k) => k.naam.trim().toLowerCase() === naam.trim().toLowerCase());
    // Het tarief van de klant (of je standaardtarief) alleen invullen zolang je zelf nog niets typte
    if (!tariefAangeraakt) setTarief(bekend?.uurtarief ?? standaardTarief ?? 0);
  }

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    setGelukt(false);
    const res = await bewaarUren(
      { datum, klant_naam: klant, project, omschrijving, duur, factureerbaar, uurtarief: factureerbaar && tarief > 0 ? tarief : null },
      bewerk?.id
    );
    setBezig(false);
    if (res.fout) {
      setFout(res.fout);
      return;
    }
    if (bewerk) {
      onKlaar?.();
    } else {
      // Klant, project en tarief blijven staan: je boekt vaak meerdere dagen achter elkaar voor dezelfde klant.
      setDuur("");
      setOmschrijving("");
      setGelukt(true);
    }
    router.refresh();
  }

  return (
    <Card className="p-5">
      <h2 className="display mb-4 text-[15px] font-semibold">{bewerk ? "Uren aanpassen" : "Uren toevoegen"}</h2>
      <form onSubmit={opslaan}>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="Datum">
            <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </Field>
          <Field label="Duur" hint={duurHint}>
            <Input value={duur} onChange={(e) => setDuur(e.target.value)} inputMode="text" autoComplete="off" placeholder="3,5 of 3:30" aria-invalid={minuten === null} />
          </Field>
        </div>
        <Field label="Klant">
          <Input list="uren-klanten" value={klant} onChange={(e) => kiesKlant(e.target.value)} autoComplete="off" placeholder="Voor wie heb je gewerkt?" />
          <datalist id="uren-klanten">
            {klanten.map((k) => (
              <option key={k.naam} value={k.naam} />
            ))}
          </datalist>
        </Field>
        <Field label="Project (optioneel)">
          <Input value={project} onChange={(e) => setProject(e.target.value)} autoComplete="off" placeholder="Bijv. Website Café De Hoek" />
        </Field>
        <Field label="Wat heb je gedaan? (optioneel)" hint="Komt als korte beschrijving op de factuur.">
          <Textarea rows={2} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={300} className="min-h-0" placeholder="Bijv. barwerkzaamheden tijdens het weekend" />
        </Field>

        <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Soort uren">
          {([[true, "Factureerbaar"], [false, "Overig (niet factureren)"]] as const).map(([waarde, label]) => (
            <button key={label} type="button" onClick={() => setFactureerbaar(waarde)} aria-pressed={factureerbaar === waarde} className={`min-h-11 rounded-md border px-2 text-[12.5px] font-medium ${factureerbaar === waarde ? "border-ink bg-paper-dark" : "border-line bg-white text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="-mt-2 mb-4 text-[11.5px] leading-relaxed text-muted">
          {factureerbaar ? "Deze uren kun je later op een factuur zetten." : "Administratie, acquisitie, opleiding: telt wel mee voor het urencriterium (1.225 uur), niet voor een factuur."}
        </p>

        {factureerbaar && (
          <Field label="Uurtarief excl. BTW" hint="Wordt ingevuld vanuit de klant of je standaardtarief. Zonder tarief kun je de uren niet factureren.">
            <DecimalInput
              value={tarief}
              onValueChange={(n) => {
                setTarief(n);
                setTariefAangeraakt(true);
              }}
            />
          </Field>
        )}

        {fout && (
          <p className="mb-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
            {fout}
          </p>
        )}
        {gelukt && (
          <p className="mb-3 rounded-md border border-ok/30 bg-ok-bg px-3.5 py-2.5 text-[13px]" role="status">
            Opgeslagen.
          </p>
        )}
        <div className="flex flex-col gap-2 min-[480px]:flex-row">
          <Button type="submit" loading={bezig} className="justify-center">
            {bewerk ? "Wijzigingen opslaan" : "Uren opslaan"}
          </Button>
          {bewerk && (
            <Button type="button" variant="ghost" onClick={onKlaar} disabled={bezig} className="justify-center">
              Annuleren
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
