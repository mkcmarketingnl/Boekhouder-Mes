import { Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { URENCRITERIUM_UREN, formatUren, urencriteriumStand } from "@/lib/uren";

// Voortgang naar de 1.225 uur van het urencriterium. Zonder dat criterium vervalt de zelfstandigenaftrek.
export function UrencriteriumKaart({ jaarMinuten, factureerbaarMinuten, vandaag, jaar }: { jaarMinuten: number; factureerbaarMinuten: number; vandaag: string; jaar: number }) {
  const s = urencriteriumStand(jaarMinuten, vandaag);
  const overigMinuten = jaarMinuten - factureerbaarMinuten;
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <Clock size={16} className="text-stamp" />
        <h2 className="display text-[15px] font-semibold">Urencriterium {jaar}</h2>
      </div>
      <div className="mono text-2xl font-semibold text-ink">
        {formatUren(s.gewerktUren)} <span className="text-[13px] font-normal text-muted">van {URENCRITERIUM_UREN.toLocaleString("nl-NL")}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper-dark" role="progressbar" aria-valuenow={Math.round(s.procent)} aria-valuemin={0} aria-valuemax={100} aria-label="Voortgang urencriterium">
        <div className={`h-full rounded-full ${s.opKoers ? "bg-ok" : "bg-warn"}`} style={{ width: `${s.procent}%` }} />
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        {s.gewerktUren >= URENCRITERIUM_UREN
          ? "Je hebt het urencriterium gehaald."
          : s.opKoers
            ? `Op dit tempo kom je rond de ${Math.round(s.prognoseUren).toLocaleString("nl-NL")} uur uit. Je ligt op koers.`
            : `Op dit tempo kom je op ongeveer ${Math.round(s.prognoseUren).toLocaleString("nl-NL")} uur: te weinig. Je zou de rest van het jaar ongeveer ${Math.ceil(s.nodigPerWeek)} uur per week moeten werken om op 1.225 te komen.`}
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        Factureerbaar: {formatUren(factureerbaarMinuten / 60)} · overig: {formatUren(overigMinuten / 60)}. Haal je 1.225 uur niet, dan vervalt de zelfstandigenaftrek (2026: €1.200) en de startersaftrek. Het gaat om alle uren die je aan je bedrijf werkt, ook niet-factureerbare.
      </p>
    </Card>
  );
}
