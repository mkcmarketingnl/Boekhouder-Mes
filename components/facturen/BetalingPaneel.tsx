"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { legHerinneringVast, markeerBetaald } from "@/lib/actions/facturen";
import { formatDate } from "@/lib/format";
import type { BetaalStatus } from "@/lib/betaling";

interface Props {
  id: string;
  status: BetaalStatus;
  dagenTeLaat: number;
  vervaldatum: string;
  betaaldOp: string | null;
  laatsteHerinneringOp: string | null;
  herinnering: { onderwerp: string; tekst: string } | null;
  vandaag: string;
}

// Betaalstatus van een definitieve factuur: markeer als betaald, of maak een herinnering voor een klant die te laat is.
export function BetalingPaneel({ id, status, dagenTeLaat, vervaldatum, betaaldOp, laatsteHerinneringOp, herinnering, vandaag }: Props) {
  const router = useRouter();
  const [datum, setDatum] = useState(vandaag);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [toon, setToon] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);

  async function zetBetaald(waarde: string | null) {
    setBezig(true);
    setFout(null);
    const res = await markeerBetaald(id, waarde);
    setBezig(false);
    if (res.fout) {
      setFout(res.fout);
      return;
    }
    router.refresh();
  }

  async function kopieer() {
    if (!herinnering) return;
    try {
      await navigator.clipboard.writeText(`${herinnering.onderwerp}\n\n${herinnering.tekst}`);
      setGekopieerd(true);
    } catch {
      setFout("Kopiëren lukt niet in deze browser. Selecteer de tekst en kopieer hem zelf.");
      return;
    }
    // Onthouden dat je een herinnering hebt gemaakt, zodat de volgende een tweede herinnering wordt.
    await legHerinneringVast(id);
    router.refresh();
  }

  return (
    <Card className="p-4 print:hidden">
      <h2 className="display mb-2 text-[15px] font-semibold">Betaling</h2>

      {status === "betaald" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[13px] text-ok">
            <CheckCircle2 size={15} /> Betaald op {betaaldOp ? formatDate(betaaldOp) : "—"}
          </p>
          <Button type="button" variant="ghost" onClick={() => zetBetaald(null)} loading={bezig} className="text-xs">
            Toch niet betaald
          </Button>
        </div>
      ) : (
        <>
          <p className={`mb-3 flex items-start gap-2 text-[13px] ${status === "te_laat" ? "text-stamp" : "text-muted"}`}>
            <Clock size={15} className="mt-0.5 shrink-0" />
            <span>
              {status === "te_laat"
                ? `Niet betaald, ${dagenTeLaat} ${dagenTeLaat === 1 ? "dag" : "dagen"} na de vervaldatum (${formatDate(vervaldatum)}).`
                : `Nog niet betaald. Vervalt op ${formatDate(vervaldatum)}.`}
              {laatsteHerinneringOp ? ` Laatste herinnering: ${formatDate(laatsteHerinneringOp)}.` : ""}
            </span>
          </p>
          <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-end">
            <div className="min-[480px]:w-44">
              <label className="mb-1 block text-[12px] font-medium" htmlFor="betaald-op">
                Betaald op
              </label>
              <Input id="betaald-op" type="date" value={datum} max={vandaag} onChange={(e) => setDatum(e.target.value)} />
            </div>
            <Button type="button" onClick={() => zetBetaald(datum)} loading={bezig} disabled={!datum} className="justify-center">
              Markeer als betaald
            </Button>
            {herinnering && (
              <Button type="button" variant="secondary" onClick={() => setToon((t) => !t)} className="justify-center" aria-expanded={toon}>
                {toon ? "Herinnering verbergen" : "Herinnering maken"}
              </Button>
            )}
          </div>

          {herinnering && toon && (
            <div className="mt-4 rounded-md border border-line bg-paper-dark p-3.5">
              <div className="mb-1 text-[12px] font-medium">Onderwerp: {herinnering.onderwerp}</div>
              <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink" style={{ fontFamily: "inherit" }}>
                {herinnering.tekst}
              </pre>
              <Button type="button" onClick={kopieer} className="mt-3 w-full justify-center min-[480px]:w-auto">
                <Copy size={14} /> {gekopieerd ? "Gekopieerd" : "Kopieer bericht"}
              </Button>
              <p className="mt-2 text-[11.5px] text-muted">Plak het in een e-mail of WhatsApp aan je klant. De app verstuurt zelf niets.</p>
            </div>
          )}
        </>
      )}

      {fout && (
        <p className="mt-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {fout}
        </p>
      )}
    </Card>
  );
}
