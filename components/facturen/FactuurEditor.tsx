"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Sparkles, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { FactuurDocument } from "@/components/facturen/FactuurDocument";
import { bewaarFactuur, maakDefinitief, verwijderConcept } from "@/lib/actions/facturen";
import { formatCurrency } from "@/lib/format";
import {
  LANDEN,
  TEMPLATES,
  berekenTotalen,
  controleerFactuur,
  plusDagen,
  isInclRegel,
  prijsExclWeergave,
  regelCenten,
  regelTotaalExcl,
  type Afzender,
  type Bevinding,
  type FactuurGegevens,
  type FactuurRegel,
  type FactuurTemplate,
  type SalesInvoice,
} from "@/lib/facturen";

interface Props {
  bestaande: SalesInvoice | null;
  afzender: Afzender;
  kor: boolean;
  betaaltermijnDagen: number;
  standaardTemplate: FactuurTemplate;
  standaardNotitie: string;
  nummerVoorbeeld: string;
  vorigNummer: string | null;
  vandaag: string;
}

interface ControleResultaat {
  samenvatting: string;
  bevindingen: Bevinding[];
  aiGelukt: boolean;
}

const LEGE_REGEL: FactuurRegel = { omschrijving: "", aantal: 1, prijs_excl: 0, btw_percentage: 21 };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function FactuurEditor({ bestaande, afzender, kor, betaaltermijnDagen, standaardTemplate, standaardNotitie, nummerVoorbeeld, vorigNummer, vandaag }: Props) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(bestaande?.id ?? null);

  const [klantNaam, setKlantNaam] = useState(bestaande?.klant_naam ?? "");
  const [klantAdres, setKlantAdres] = useState(bestaande?.klant_adres ?? "");
  const [klantPostcode, setKlantPostcode] = useState(bestaande?.klant_postcode ?? "");
  const [klantPlaats, setKlantPlaats] = useState(bestaande?.klant_plaats ?? "");
  const [klantLand, setKlantLand] = useState(bestaande?.klant_land ?? "Nederland");
  const [klantBtw, setKlantBtw] = useState(bestaande?.klant_btw_nummer ?? "");
  const [klantKvk, setKlantKvk] = useState(bestaande?.klant_kvk ?? "");
  const [klantEmail, setKlantEmail] = useState(bestaande?.klant_email ?? "");

  const [factuurdatum, setFactuurdatum] = useState(bestaande?.factuurdatum ?? vandaag);
  const [vervaldatum, setVervaldatum] = useState(bestaande?.vervaldatum ?? plusDagen(vandaag, betaaltermijnDagen));
  const [vervalHandmatig, setVervalHandmatig] = useState(!!bestaande);
  const [leverdatum, setLeverdatum] = useState(bestaande?.leverdatum ?? "");

  const [regels, setRegels] = useState<FactuurRegel[]>(bestaande?.regels?.length ? bestaande.regels : [{ ...LEGE_REGEL }]);
  const [redenen, setRedenen] = useState<Record<number, string>>({});
  const [verlegd, setVerlegd] = useState(bestaande?.btw_verlegd ?? false);
  const [notitie, setNotitie] = useState(bestaande?.notitie ?? standaardNotitie);
  const [template, setTemplate] = useState<FactuurTemplate>(bestaande?.template ?? standaardTemplate);
  const [boekInOmzet, setBoekInOmzet] = useState(true);

  const [bezig, setBezig] = useState<null | "opslaan" | "controle" | "definitief" | "ai-btw" | "verwijderen">(null);
  const [melding, setMelding] = useState<{ soort: "ok" | "fout"; tekst: string } | null>(null);
  const [controle, setControle] = useState<ControleResultaat | null>(null);
  const [controleHandtekening, setControleHandtekening] = useState<string>("");
  const [wachtOpAkkoord, setWachtOpAkkoord] = useState(false);

  const nulBtw = verlegd || kor;
  const gegevens: FactuurGegevens = useMemo(
    () => ({
      factuurnummer: nummerVoorbeeld,
      klant_naam: klantNaam,
      klant_adres: klantAdres || null,
      klant_postcode: klantPostcode || null,
      klant_plaats: klantPlaats || null,
      klant_land: klantLand,
      klant_btw_nummer: klantBtw.trim() ? klantBtw.replace(/[\s.]/g, "").toUpperCase() : null,
      klant_kvk: klantKvk || null,
      factuurdatum,
      vervaldatum,
      leverdatum: leverdatum || null,
      regels: regels.map((r) => (isInclRegel(r) ? { ...r, prijs_excl: prijsExclWeergave(r, nulBtw) } : r)),
      btw_verlegd: verlegd,
      kor,
      notitie: notitie || null,
    }),
    [nummerVoorbeeld, klantNaam, klantAdres, klantPostcode, klantPlaats, klantLand, klantBtw, klantKvk, factuurdatum, vervaldatum, leverdatum, regels, verlegd, kor, notitie, nulBtw]
  );

  const handtekening = JSON.stringify([gegevens, klantEmail, template]);
  const verouderd = !!controle && controleHandtekening !== handtekening;
  const totalen = berekenTotalen(regels, { btw_verlegd: verlegd, kor });
  // Directe controle in code terwijl je typt; de AI-controle komt erbovenop wanneer je daarom vraagt.
  const liveBevindingen = useMemo(() => controleerFactuur(gegevens, afzender, { vorigNummer, vandaag }), [gegevens, afzender, vorigNummer, vandaag]);
  const getoond: Bevinding[] = controle && !verouderd ? controle.bevindingen : liveBevindingen;
  const fouten = getoond.filter((b) => b.ernst === "fout");
  const letOps = getoond.filter((b) => b.ernst === "let_op");
  function invoer() {
    return {
      id: id ?? undefined,
      klant_naam: klantNaam,
      klant_adres: klantAdres,
      klant_postcode: klantPostcode,
      klant_plaats: klantPlaats,
      klant_land: klantLand,
      klant_btw_nummer: klantBtw,
      klant_kvk: klantKvk,
      klant_email: klantEmail,
      factuurdatum,
      vervaldatum,
      leverdatum,
      regels,
      btw_verlegd: verlegd,
      notitie,
      template,
    };
  }

  function zetRegel(i: number, patch: Partial<FactuurRegel>) {
    setRegels((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  // Per regel wisselen tussen prijs excl. en incl. BTW: het getoonde bedrag wordt omgerekend, niet gewist.
  function wisselModus(i: number, incl: boolean) {
    setRegels((huidig) =>
      huidig.map((r, j) => {
        if (j !== i || incl === isInclRegel(r)) return r;
        const pct = nulBtw ? 0 : Number(r.btw_percentage);
        if (incl) return { ...r, prijs_incl: r2(Number(r.prijs_excl || 0) * (1 + pct / 100)) };
        const { prijs_incl: _weg, ...rest } = r;
        void _weg;
        return { ...rest, prijs_excl: r2(Number(r.prijs_incl) / (1 + pct / 100)) };
      })
    );
  }

  async function opslaan(stil = false): Promise<string | null> {
    setBezig("opslaan");
    if (!stil) setMelding(null);
    const res = await bewaarFactuur(invoer());
    setBezig(null);
    if (res.fout || !res.data) {
      setMelding({ soort: "fout", tekst: res.fout ?? "Opslaan is mislukt." });
      return null;
    }
    if (!id) {
      setId(res.data.id);
      // De URL laten we bewust staan: een URL-wijziging laadt de pagina opnieuw en wist dan o.a. het controleresultaat.
    }
    if (!stil) setMelding({ soort: "ok", tekst: "Concept opgeslagen." });
    return res.data.id;
  }

  async function controleer(): Promise<ControleResultaat | null> {
    const factuurId = await opslaan(true);
    if (!factuurId) return null;
    setBezig("controle");
    setMelding(null);
    try {
      const res = await fetch("/api/invoices/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: factuurId }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Controle mislukt.");
      setControle(json.data);
      setControleHandtekening(handtekening);
      return json.data as ControleResultaat;
    } catch (err) {
      setMelding({ soort: "fout", tekst: err instanceof Error ? err.message : "De controle is niet gelukt." });
      return null;
    } finally {
      setBezig(null);
    }
  }

  async function aiBtw() {
    const bruikbaar = regels.filter((r) => r.omschrijving.trim());
    if (bruikbaar.length === 0) {
      setMelding({ soort: "fout", tekst: "Vul eerst bij minstens één regel een omschrijving in." });
      return;
    }
    setBezig("ai-btw");
    setMelding(null);
    try {
      const res = await fetch("/api/invoices/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regels: regels.map((r) => ({ omschrijving: r.omschrijving })), klant_naam: klantNaam, klant_land: klantLand, klant_btw_nummer: klantBtw }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Suggestie mislukt.");
      const nieuweRedenen: Record<number, string> = {};
      setRegels((huidig) =>
        huidig.map((r, i) => {
          const t = (json.data.tarieven as { regel: number; percentage: number; reden: string }[]).find((x) => x.regel === i + 1);
          if (t) nieuweRedenen[i] = t.reden;
          return t ? { ...r, btw_percentage: t.percentage } : r;
        })
      );
      setRedenen(nieuweRedenen);
      if (json.data.btw_verlegd !== verlegd) setVerlegd(!!json.data.btw_verlegd);
      setMelding({ soort: "ok", tekst: json.data.btw_verlegd ? `BTW-tarieven ingevuld. ${json.data.verlegd_reden ?? "De BTW is verlegd."}` : "BTW-tarieven ingevuld — controleer ze even; jij blijft verantwoordelijk." });
    } catch (err) {
      setMelding({ soort: "fout", tekst: err instanceof Error ? err.message : "De BTW-suggestie is niet gelukt." });
    } finally {
      setBezig(null);
    }
  }

  async function definitiefMaken(akkoord: boolean) {
    setMelding(null);
    let resultaat = controle && !verouderd ? controle : null;
    if (!resultaat) {
      resultaat = await controleer();
      if (!resultaat) return;
    }
    const heeftFout = resultaat.bevindingen.some((b) => b.ernst === "fout");
    if (heeftFout) {
      setMelding({ soort: "fout", tekst: "Er staan nog fouten in de factuur. Los die eerst op." });
      return;
    }
    if (resultaat.bevindingen.length > 0 && !akkoord) {
      setWachtOpAkkoord(true);
      return;
    }
    const factuurId = id ?? (await opslaan(true));
    if (!factuurId) return;
    setBezig("definitief");
    const res = await maakDefinitief(factuurId, { boekInOmzet, akkoordLetOps: true });
    setBezig(null);
    if (res.fout || !res.data) {
      setMelding({ soort: "fout", tekst: res.fout ?? "Definitief maken is mislukt." });
      if (res.bevindingen) setControle({ samenvatting: "Er zijn punten gevonden bij het definitief maken.", bevindingen: res.bevindingen, aiGelukt: true });
      return;
    }
    router.push(`/facturen/${factuurId}`);
    router.refresh();
  }

  async function verwijder() {
    if (!id) {
      router.push("/facturen");
      return;
    }
    if (!window.confirm("Dit concept verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    setBezig("verwijderen");
    const res = await verwijderConcept(id);
    setBezig(null);
    if (res.fout) {
      setMelding({ soort: "fout", tekst: res.fout });
      return;
    }
    router.push("/facturen");
    router.refresh();
  }

  const drukBezig = bezig !== null;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="display mb-4 text-[15px] font-semibold">Klant</h2>
        <Field label="Naam van je klant">
          <Input value={klantNaam} onChange={(e) => setKlantNaam(e.target.value)} placeholder="Bijv. Studio Noord B.V." autoComplete="off" />
        </Field>
        <Field label="Straat en huisnummer">
          <Input value={klantAdres} onChange={(e) => setKlantAdres(e.target.value)} autoComplete="off" />
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-[8rem_1fr]">
          <Field label="Postcode">
            <Input value={klantPostcode} onChange={(e) => setKlantPostcode(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Plaats">
            <Input value={klantPlaats} onChange={(e) => setKlantPlaats(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Land" hint="Bepaalt mede welke BTW van toepassing is (bijv. een klant in een ander EU-land).">
          <Select value={klantLand} onChange={(e) => setKlantLand(e.target.value)}>
            {LANDEN.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="BTW-nummer klant (optioneel)">
            <Input value={klantBtw} onChange={(e) => setKlantBtw(e.target.value)} placeholder="NL123456789B01" autoComplete="off" />
          </Field>
          <Field label="KVK-nummer klant (optioneel)">
            <Input value={klantKvk} onChange={(e) => setKlantKvk(e.target.value)} inputMode="numeric" autoComplete="off" />
          </Field>
        </div>
        <Field label="E-mailadres klant (optioneel)">
          <Input type="email" value={klantEmail} onChange={(e) => setKlantEmail(e.target.value)} autoComplete="off" />
        </Field>
      </Card>

      <Card className="p-5">
        <h2 className="display mb-4 text-[15px] font-semibold">Factuurgegevens</h2>
        <div className="mb-4 rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] text-muted">
          Factuurnummer:{" "}
          <strong className="mono text-ink">{bestaande?.status === "definitief" ? bestaande.factuurnummer : nummerVoorbeeld}</strong> — wordt automatisch en oplopend toegekend wanneer je de factuur definitief maakt.
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label="Factuurdatum">
            <Input
              type="date"
              value={factuurdatum}
              onChange={(e) => {
                setFactuurdatum(e.target.value);
                if (!vervalHandmatig && e.target.value) setVervaldatum(plusDagen(e.target.value, betaaltermijnDagen));
              }}
            />
          </Field>
          <Field label="Vervaldatum" hint={`Standaard ${betaaltermijnDagen} dagen na de factuurdatum.`}>
            <Input
              type="date"
              value={vervaldatum}
              onChange={(e) => {
                setVervaldatum(e.target.value);
                setVervalHandmatig(true);
              }}
            />
          </Field>
        </div>
        <Field label="Leverdatum (optioneel)" hint="Alleen invullen als de levering of dienst op een andere datum was dan de factuurdatum.">
          <Input type="date" value={leverdatum} onChange={(e) => setLeverdatum(e.target.value)} />
        </Field>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-[15px] font-semibold">Producten en diensten</h2>
          <Button type="button" variant="secondary" onClick={aiBtw} loading={bezig === "ai-btw"} disabled={drukBezig && bezig !== "ai-btw"} className="text-xs">
            <Sparkles size={14} />
            Laat AI de BTW bepalen
          </Button>
        </div>

        <div className="space-y-3">
          {regels.map((r, i) => (
            <div key={i} className="rounded-md border border-line bg-white p-3">
              <Field label={`Omschrijving regel ${i + 1}`}>
                <Textarea rows={2} value={r.omschrijving} onChange={(e) => zetRegel(i, { omschrijving: e.target.value })} placeholder="Bijv. Webdesign — homepage en 3 subpagina's" className="min-h-0" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Aantal">
                  <DecimalInput value={r.aantal} onValueChange={(n) => zetRegel(i, { aantal: n })} placeholder="1" />
                </Field>
                <Field label={isInclRegel(r) ? "Prijs incl." : "Prijs excl."}>
                  {isInclRegel(r) ? (
                    <DecimalInput value={Number(r.prijs_incl) || 0} onValueChange={(n) => zetRegel(i, { prijs_incl: n })} />
                  ) : (
                    <DecimalInput value={Number(r.prijs_excl) || 0} onValueChange={(n) => zetRegel(i, { prijs_excl: n })} />
                  )}
                </Field>
                <Field label="BTW">
                  <Select value={nulBtw ? 0 : r.btw_percentage} disabled={nulBtw} onChange={(e) => zetRegel(i, { btw_percentage: Number(e.target.value) })}>
                    <option value={21}>21%</option>
                    <option value={9}>9%</option>
                    <option value={0}>0%</option>
                  </Select>
                </Field>
              </div>
              <div className="-mt-2 mb-3 grid grid-cols-2 gap-2" role="group" aria-label={`Prijs van regel ${i + 1} invoeren`}>
                {([[false, "Prijs excl. BTW"], [true, "Prijs incl. BTW"]] as const).map(([incl, label]) => (
                  <button key={label} type="button" onClick={() => wisselModus(i, incl)} aria-pressed={isInclRegel(r) === incl} className={`min-h-11 rounded-md border px-2 text-[12.5px] font-medium ${isInclRegel(r) === incl ? "border-ink bg-paper-dark" : "border-line bg-white text-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {redenen[i] && <p className="-mt-2 mb-2 flex gap-1.5 text-[11.5px] leading-relaxed text-muted"><Sparkles size={12} className="mt-0.5 shrink-0" /> {redenen[i]}</p>}
              <div className="flex items-center justify-between">
                <span className="mono text-[12px] text-muted">
                  {isInclRegel(r) ? `Regel incl. BTW: ${formatCurrency(regelCenten(r, nulBtw).incl / 100)} (excl. ${formatCurrency(regelTotaalExcl(r, nulBtw))})` : `Regel excl. BTW: ${formatCurrency(regelTotaalExcl(r, nulBtw))}`}
                </span>
                {regels.length > 1 && (
                  <button type="button" onClick={() => setRegels((x) => x.filter((_, j) => j !== i))} className="flex min-h-11 items-center gap-1 px-2 text-[12px] text-muted hover:text-stamp" aria-label={`Verwijder regel ${i + 1}`}>
                    <Trash2 size={14} /> Verwijder
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRegels((x) => [...x, x.length > 0 && isInclRegel(x[x.length - 1]) ? { ...LEGE_REGEL, prijs_incl: 0 } : { ...LEGE_REGEL }])} className="mt-3 flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-ink underline">
          <Plus size={14} /> Regel toevoegen
        </button>

        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {kor ? (
            <p className="flex gap-2 text-[12.5px] leading-relaxed text-muted">
              <Info size={14} className="mt-0.5 shrink-0" /> Je gebruikt de kleineondernemersregeling (KOR): er wordt geen BTW gerekend en de vermelding komt automatisch op de factuur.
            </p>
          ) : (
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px]">
              <input type="checkbox" checked={verlegd} onChange={(e) => setVerlegd(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#211F1C]" />
              <span>
                <strong>BTW verlegd</strong> — de klant rekent de BTW zelf af (bijv. zakelijke klant in een ander EU-land, of een verleggingsregeling in de bouw).
                <span className="block text-[11.5px] text-muted">Alle regels gaan dan op 0% en de vermelding komt automatisch op de factuur. Dit mag alleen bij een klant met BTW-nummer.</span>
              </span>
            </label>
          )}
        </div>

        <div className="mono mt-4 space-y-1 rounded-md border border-line bg-paper-dark p-3.5 text-[13px]">
          <div className="flex justify-between">
            <span>Totaal excl. BTW</span>
            <span>{formatCurrency(totalen.excl)}</span>
          </div>
          {totalen.perTarief.filter((t) => t.percentage > 0).map((t) => (
            <div key={t.percentage} className="flex justify-between text-muted">
              <span>BTW {t.percentage}% over {formatCurrency(t.grondslag)}</span>
              <span>{formatCurrency(t.btw)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
            <span>Totaal incl. BTW</span>
            <span>{formatCurrency(totalen.incl)}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="display mb-4 text-[15px] font-semibold">Opmerking onderaan (optioneel)</h2>
        <Textarea rows={3} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Bijv. Bedankt voor de opdracht!" />
      </Card>

      <Card className="p-5">
        <h2 className="display mb-1 text-[15px] font-semibold">Uiterlijk</h2>
        <p className="mb-3 text-[12.5px] text-muted">Kies hoe je factuur eruitziet. Je past alleen de gegevens aan; de opmaak staat vast, dat houdt het simpel.</p>
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplate(t.id)}
              aria-pressed={template === t.id}
              className={`min-h-11 rounded-md border p-3 text-left ${template === t.id ? "border-ink bg-paper-dark" : "border-line bg-white"}`}
            >
              <div className="text-[13px] font-semibold">{t.naam}</div>
              <div className="text-[11.5px] text-muted">{t.omschrijving}</div>
            </button>
          ))}
        </div>
      </Card>

      <section>
        <h2 className="display mb-3 text-[15px] font-semibold">Voorbeeld</h2>
        <FactuurDocument gegevens={gegevens} afzender={afzender} template={template} conceptStempel />
      </section>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="display text-[15px] font-semibold">Controle</h2>
          {verouderd && <span className="text-[11.5px] text-warn">Gewijzigd sinds de laatste controle</span>}
        </div>
        {controle && !verouderd && <p className="mb-3 text-[12.5px] leading-relaxed text-ink">{controle.samenvatting}</p>}
        {getoond.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-ok">
            <CheckCircle2 size={16} /> {controle && !verouderd ? "Geen problemen gevonden." : "Geen problemen gevonden door de automatische controle. Draai ook de AI-controle voor een inhoudelijke check."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {[...fouten, ...letOps].map((b, i) => (
              <li key={i} className={`rounded-md border p-3 ${b.ernst === "fout" ? "border-stamp/25 bg-stamp-bg" : "border-warn/30 bg-warn-bg"}`}>
                <div className="flex gap-2">
                  <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${b.ernst === "fout" ? "text-stamp" : "text-warn"}`} />
                  <div className="text-[12.5px] leading-relaxed text-ink">
                    <strong>{b.melding}</strong>
                    <p className="mt-0.5 text-muted">{b.uitleg}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {controle && !controle.aiGelukt && <p className="mt-3 text-[11.5px] text-muted">De AI-controle kon nu niet draaien; de automatische controles zijn wel uitgevoerd.</p>}
      </Card>

      {melding && (
        <p className={`rounded-md border px-3.5 py-2.5 text-[13px] ${melding.soort === "ok" ? "border-ok/30 bg-ok-bg text-ink" : "border-stamp/25 bg-stamp-bg text-ink"}`} role="status">
          {melding.tekst}
        </p>
      )}

      {wachtOpAkkoord && letOps.length > 0 && (
        <Card className="border-warn/30 bg-warn-bg p-4">
          <p className="mb-3 text-[13px] leading-relaxed text-ink">
            Er {letOps.length === 1 ? "is 1 aandachtspunt" : `zijn ${letOps.length} aandachtspunten`} (hierboven). Een definitieve factuur kun je daarna niet meer wijzigen. Heb je ze bekeken en klopt alles?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => definitiefMaken(true)} loading={bezig === "definitief"} disabled={drukBezig}>
              Ja, maak definitief
            </Button>
            <Button type="button" variant="ghost" onClick={() => setWachtOpAkkoord(false)} disabled={drukBezig}>
              Nee, ik ga het aanpassen
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3 pb-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px]">
          <input type="checkbox" checked={boekInOmzet} onChange={(e) => setBoekInOmzet(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#211F1C]" />
          <span>
            Meteen in mijn omzet boeken
            <span className="block text-[11.5px] text-muted">Zo staat deze factuur direct op je dashboard en in je BTW-overzicht. Je hoeft hem dan niet nog eens te uploaden.</span>
          </span>
        </label>
        <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap">
          <Button type="button" variant="secondary" onClick={() => opslaan()} loading={bezig === "opslaan"} disabled={drukBezig && bezig !== "opslaan"} className="justify-center">
            Opslaan als concept
          </Button>
          <Button type="button" variant="secondary" onClick={controleer} loading={bezig === "controle"} disabled={drukBezig && bezig !== "controle"} className="justify-center">
            <Sparkles size={14} />
            Controleer met AI
          </Button>
          <Button type="button" onClick={() => definitiefMaken(false)} loading={bezig === "definitief"} disabled={drukBezig && bezig !== "definitief"} className="justify-center">
            Controleren en definitief maken
          </Button>
        </div>
        <button type="button" onClick={verwijder} disabled={drukBezig} className="min-h-11 text-[12.5px] text-muted underline hover:text-stamp">
          {id ? "Dit concept verwijderen" : "Annuleren"}
        </button>
      </div>
    </div>
  );
}
