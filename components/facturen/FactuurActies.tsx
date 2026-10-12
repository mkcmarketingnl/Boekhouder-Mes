"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Pencil, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { boekInOmzet } from "@/lib/actions/facturen";
import type { AiControle } from "@/lib/facturen";

// Acties bij een definitieve factuur: afdrukken/PDF, in de omzet boeken en een (nieuwe) AI-controle.
export function FactuurActies({ id, geboekt, controle }: { id: string; geboekt: boolean; controle: AiControle | null }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<null | "boeken" | "controle">(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [resultaat, setResultaat] = useState<AiControle | null>(controle);

  async function boek() {
    setBezig("boeken");
    setMelding(null);
    const res = await boekInOmzet(id);
    setBezig(null);
    if (res.fout) {
      setMelding(res.fout);
      return;
    }
    router.refresh();
  }

  async function controleer() {
    setBezig("controle");
    setMelding(null);
    try {
      const res = await fetch("/api/invoices/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Controle mislukt.");
      setResultaat({ samenvatting: json.data.samenvatting, bevindingen: json.data.bevindingen });
    } catch (err) {
      setMelding(err instanceof Error ? err.message : "De controle is niet gelukt.");
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap">
        <Button type="button" onClick={() => window.print()} className="justify-center">
          <Printer size={15} /> Afdrukken / opslaan als PDF
        </Button>
        <Link href={`/facturen/${id}/bewerken`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:bg-paper-dark">
          <Pencil size={14} /> Factuur aanpassen
        </Link>
        {!geboekt && (
          <Button type="button" variant="secondary" onClick={boek} loading={bezig === "boeken"} disabled={bezig !== null && bezig !== "boeken"} className="justify-center">
            Boek in mijn omzet
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={controleer} loading={bezig === "controle"} disabled={bezig !== null && bezig !== "controle"} className="justify-center">
          <Sparkles size={14} /> Controleer met AI
        </Button>
      </div>
      {geboekt && (
        <p className="flex items-center gap-2 text-[13px] text-ok">
          <CheckCircle2 size={15} /> Deze factuur staat in je omzet (dashboard, BTW-modus en relaties).
        </p>
      )}
      {melding && (
        <p className="rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {melding}
        </p>
      )}
      {resultaat && (
        <Card className="p-4">
          <h2 className="display mb-2 text-[15px] font-semibold">Laatste controle</h2>
          <p className="mb-3 text-[12.5px] leading-relaxed">{resultaat.samenvatting}</p>
          {resultaat.bevindingen.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-ok">
              <CheckCircle2 size={15} /> Geen problemen gevonden.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {resultaat.bevindingen.map((b, i) => (
                <li key={i} className={`rounded-md border p-3 ${b.ernst === "fout" ? "border-stamp/25 bg-stamp-bg" : "border-warn/30 bg-warn-bg"}`}>
                  <div className="flex gap-2">
                    <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${b.ernst === "fout" ? "text-stamp" : "text-warn"}`} />
                    <div className="text-[12.5px] leading-relaxed">
                      <strong>{b.melding}</strong>
                      <p className="mt-0.5 text-muted">{b.uitleg}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
