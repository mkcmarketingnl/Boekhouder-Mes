"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Select } from "@/components/ui/Input";
import { bewaarIbAntwoorden } from "@/lib/actions/belasting";
import { berekenIb, effectExtraAftrek, ibStappen, besparing, type IbAntwoorden } from "@/lib/belasting";
import { IB_VRAGEN, LEERKAARTEN, type IbVraag } from "@/lib/ibVragen";
import { formatCurrency } from "@/lib/format";

type WinstBasis = "nu" | "prognose" | "zelf";

interface Props {
  jaar: number;
  rechtsvorm: "eenmanszaak" | "vof";
  winstTotNu: number;
  // null als er te weinig van het jaar voorbij is voor een betrouwbare prognose
  winstPrognose: number | null;
  startAntwoorden: IbAntwoorden;
  opslaanMogelijk: boolean;
  uren: { gewerktUren: number; prognoseUren: number; opKoers: boolean } | null;
}

const e = (n: number) => formatCurrency(n);

function JaNee({ waarde, onKies, label }: { waarde: boolean | null | undefined; onKies: (v: boolean) => void; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={label}>
      {([[true, "Ja"], [false, "Nee"]] as const).map(([v, tekst]) => (
        <button key={tekst} type="button" onClick={() => onKies(v)} aria-pressed={waarde === v} className={`min-h-11 rounded-md border px-3 text-[13px] font-medium ${waarde === v ? "border-ink bg-ink text-paper" : "border-line bg-white hover:bg-paper-dark"}`}>
          {tekst}
        </button>
      ))}
    </div>
  );
}

export function BelastingModus({ jaar, rechtsvorm, winstTotNu, winstPrognose, startAntwoorden, opslaanMogelijk, uren }: Props) {
  const [a, setA] = useState<IbAntwoorden>(startAntwoorden);
  const [basis, setBasis] = useState<WinstBasis>("nu");
  const [zelfWinst, setZelfWinst] = useState(0);
  const [status, setStatus] = useState<"" | "bezig" | "opgeslagen" | "fout">("");
  const [fout, setFout] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bij de bedragvragen onthouden we ja/nee los van het bedrag (ja met nog € 0 is een geldige tussenstand)
  const [jaKeuze, setJaKeuze] = useState<Record<string, boolean | null>>({
    kia: startAntwoorden.kiaInvestering == null ? null : startAntwoorden.kiaInvestering > 0,
    aov: startAntwoorden.aovPremie == null ? null : startAntwoorden.aovPremie > 0,
    pensioen: startAntwoorden.pensioenPremie == null ? null : startAntwoorden.pensioenPremie > 0,
  });

  function wijzig(patch: IbAntwoorden) {
    const nieuw = { ...a, ...patch };
    setA(nieuw);
    if (!opslaanMogelijk) return;
    setStatus("bezig");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await bewaarIbAntwoorden(jaar, nieuw);
      if (res.fout) {
        setStatus("fout");
        setFout(res.fout);
      } else {
        setStatus("opgeslagen");
        setFout(null);
      }
    }, 600);
  }

  const aandeel = rechtsvorm === "vof" ? Math.min(100, Math.max(0, a.vofAandeel ?? 100)) / 100 : 1;
  const gekozenWinst = basis === "nu" ? winstTotNu : basis === "prognose" ? (winstPrognose ?? winstTotNu) : zelfWinst;
  const invoer = useMemo(() => ({ winst: gekozenWinst * aandeel, antwoorden: a, jaar }), [gekozenWinst, aandeel, a, jaar]);
  const r = useMemo(() => berekenIb(invoer), [invoer]);
  const stappen = ibStappen(r);

  const vragen = IB_VRAGEN.filter((v) => !v.alleenVof || rechtsvorm === "vof");
  const beantwoord = (v: IbVraag) => {
    switch (v.id) {
      case "urencriterium": return a.urencriterium != null;
      case "starter": return a.starter != null;
      case "kia": return jaKeuze.kia != null;
      case "aov": return jaKeuze.aov != null;
      case "pensioen": return jaKeuze.pensioen != null;
      case "vof_aandeel": return a.vofAandeel != null;
    }
  };
  const aantalBeantwoord = vragen.filter(beantwoord).length;

  const tips: { sleutel: string; tekst: string }[] = [];
  if (r.winst > 0) {
    tips.push({ sleutel: "marginaal", tekst: `Van elke extra € 100 winst gaat ongeveer € ${Math.round(r.marginaalTarief)} naar belasting en Zvw. Een uitgave die je zakelijk kunt aftrekken bespaart dus tot ongeveer ${Math.round(r.marginaalTarief)}% van het bedrag.` });
    const pens = effectExtraAftrek(invoer, "pensioen", 1000);
    if (pens > 0) tips.push({ sleutel: "pensioen", tekst: `Stort je dit jaar nog € 1.000 extra in een lijfrente of pensioen, dan scheelt dat ongeveer ${e(pens)} aan belasting (binnen je jaarruimte).` });
    const kia = effectExtraAftrek(invoer, "kia", 3500);
    if ((a.kiaInvestering ?? 0) < 2900 && kia > 0) tips.push({ sleutel: "kia", tekst: `Koop je in één jaar voor € 3.500 aan bedrijfsmiddelen (bijvoorbeeld een laptop en een scherm), dan krijg je € 980 extra aftrek. Dat scheelt ongeveer ${e(kia)} aan belasting. Onder € 2.900 per jaar krijg je niets.` });
    if (a.urencriterium !== false) {
      const verlies = -besparing(invoer, { urencriterium: false });
      if (verlies > 0) tips.push({ sleutel: "uren", tekst: `Je ondernemersaftrek is ongeveer ${e(verlies)} aan belasting waard. Haal je de 1.225 uur niet, dan vervalt die.` });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-1 text-[12px] text-muted">Geschatte belasting over {jaar}</div>
        <div className="mono text-3xl font-semibold text-ink">{e(r.totaal)}</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Inkomstenbelasting {e(r.nettoIb)} + Zvw-bijdrage {e(r.zvwBijdrage)}.{r.winst > 0 ? ` Dat is ${String(r.effectiefPercentage).replace(".", ",")}% van je winst.` : ""}
          {basis !== "nu" && r.totaal > 0 ? ` Zet ongeveer ${e(r.totaal / 12)} per maand opzij.` : ""}
        </p>
        {!r.regelsExact && <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12px]">De regels voor {jaar} zijn nog niet vastgesteld. Deze berekening gebruikt de regels van 2026.</p>}

        <div className="mt-4 border-t border-line pt-3">
          <label className="mb-1.5 block text-[12px] font-medium" htmlFor="winst-basis">
            Gebaseerd op
          </label>
          <Select id="winst-basis" value={basis} onChange={(ev) => setBasis(ev.target.value as WinstBasis)}>
            <option value="nu">Je winst tot nu toe ({e(winstTotNu)})</option>
            {winstPrognose != null && <option value="prognose">Prognose voor het hele jaar ({e(winstPrognose)})</option>}
            <option value="zelf">Een bedrag dat ik zelf invul</option>
          </Select>
          {basis === "zelf" && (
            <div className="mt-2">
              <label className="mb-1 block text-[12px] text-muted">Verwachte winst dit jaar, excl. BTW</label>
              <DecimalInput value={zelfWinst} onValueChange={setZelfWinst} />
            </div>
          )}
          {basis === "prognose" && <p className="mt-1.5 text-[11.5px] text-muted">De prognose rekent je winst tot nu toe door naar een heel jaar. Seizoenswerk of grote uitgaven later in het jaar zijn daar niet in verwerkt.</p>}
          {rechtsvorm === "vof" && <p className="mt-1.5 text-[11.5px] text-muted">VOF: gerekend met jouw aandeel van {Math.round(aandeel * 100)}% in de winst.</p>}
        </div>
      </Card>

      {uren && (
        <Card className="p-4">
          <p className="text-[12.5px] leading-relaxed">
            <strong>Uit je urenregistratie:</strong> {Math.round(uren.gewerktUren).toLocaleString("nl-NL")} uur tot nu toe, ongeveer {Math.round(uren.prognoseUren).toLocaleString("nl-NL")} uur op jaarbasis.{" "}
            {uren.opKoers ? "Dat is genoeg voor het urencriterium." : "Dat is te weinig voor het urencriterium (1.225 uur)."}{" "}
            <Link href="/uren" className="underline">
              Naar je uren
            </Link>
          </p>
        </Card>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[15px] font-semibold">Vragen over jouw situatie</h2>
          <span className="text-[12px] text-muted" aria-live="polite">
            {aantalBeantwoord} van {vragen.length} beantwoord
            {status === "bezig" && " · opslaan…"}
            {status === "opgeslagen" && " · opgeslagen"}
          </span>
        </div>
        {!opslaanMogelijk && <p className="mb-3 rounded-md border border-warn/30 bg-warn-bg px-3.5 py-2.5 text-[12.5px]">Je antwoorden worden nog niet bewaard: dat heeft een eenmalige database-update nodig (migratie 0008_uren_belasting_geld.sql). De berekening werkt wel.</p>}
        {fout && <p className="mb-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">{fout}</p>}
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">Zolang je een vraag niet beantwoordt, rekenen we met de gewone aanname (bijvoorbeeld dat je het urencriterium haalt). Elk antwoord werkt direct door in het bedrag hierboven en op je dashboard.</p>

        <div className="space-y-3">
          {vragen.map((v) => (
            <Card key={v.id} className="p-4">
              <div className="mb-1 flex items-start gap-2">
                {beantwoord(v) ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-line" />}
                <h3 className="text-[14px] font-medium leading-snug">{v.vraag}</h3>
              </div>

              {v.soort === "janee" && v.id === "urencriterium" && (
                <div className="mt-3">
                  <JaNee waarde={a.urencriterium} onKies={(x) => wijzig({ urencriterium: x })} label={v.titel} />
                </div>
              )}

              {v.id === "starter" && (
                <div className="mt-3 space-y-3">
                  <JaNee waarde={a.starter} onKies={(x) => wijzig({ starter: x })} label={v.titel} />
                  {a.starter && (
                    <div>
                      <label className="mb-1 block text-[12px] text-muted" htmlFor="starter-eerder">
                        {v.bedragLabel}
                      </label>
                      <Select id="starter-eerder" value={String(a.starterEerderGebruikt ?? 0)} onChange={(ev) => wijzig({ starterEerderGebruikt: Number(ev.target.value) })}>
                        <option value="0">Nog niet</option>
                        <option value="1">1 keer</option>
                        <option value="2">2 keer</option>
                        <option value="3">3 keer (dan is hij op)</option>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {(v.id === "kia" || v.id === "aov" || v.id === "pensioen") && (
                <div className="mt-3 space-y-3">
                  <JaNee
                    waarde={jaKeuze[v.id]}
                    label={v.titel}
                    onKies={(x) => {
                      setJaKeuze((k) => ({ ...k, [v.id]: x }));
                      const veld = v.id === "kia" ? "kiaInvestering" : v.id === "aov" ? "aovPremie" : "pensioenPremie";
                      wijzig({ [veld]: x ? (a[veld] ?? 0) : 0 } as IbAntwoorden);
                    }}
                  />
                  {jaKeuze[v.id] && (
                    <div>
                      <label className="mb-1 block text-[12px] text-muted">{v.bedragLabel}</label>
                      <DecimalInput
                        value={(v.id === "kia" ? a.kiaInvestering : v.id === "aov" ? a.aovPremie : a.pensioenPremie) ?? 0}
                        onValueChange={(n) => wijzig(v.id === "kia" ? { kiaInvestering: n } : v.id === "aov" ? { aovPremie: n } : { pensioenPremie: n })}
                        placeholder={v.bedragHint}
                      />
                    </div>
                  )}
                </div>
              )}

              {v.id === "vof_aandeel" && (
                <div className="mt-3">
                  <label className="mb-1 block text-[12px] text-muted">{v.bedragLabel}</label>
                  <DecimalInput value={a.vofAandeel ?? 100} onValueChange={(n) => wijzig({ vofAandeel: Math.min(100, n) })} placeholder={v.bedragHint} />
                </div>
              )}

              <details className="mt-3 text-[12.5px] leading-relaxed text-muted">
                <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-ink">
                  <ChevronDown size={14} /> Uitleg en tips
                </summary>
                <p className="mt-1">{v.uitleg}</p>
                <p className="mt-2 flex gap-1.5">
                  <Lightbulb size={14} className="mt-0.5 shrink-0 text-warn" />
                  <span>{v.leer}</span>
                </p>
              </details>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="display mb-3 text-[15px] font-semibold">Zo komt het bedrag tot stand</h2>
        <Card className="p-4">
          <ul className="divide-y divide-line">
            {stappen.map((s) => (
              <li key={s.sleutel} className={`flex items-baseline justify-between gap-3 py-2 text-[13px] ${["belastbareWinst", "totaal"].includes(s.sleutel) ? "font-semibold" : ""}`}>
                <span>{s.label}</span>
                <span className="mono shrink-0">{s.bedrag < 0 ? `− ${e(-s.bedrag)}` : e(s.bedrag)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            Aannames: je bent ondernemer zonder partner, loondienst of eigen woning, jonger dan de AOW-leeftijd, en je hebt geen andere inkomsten. Dat verandert je belasting. Dit is een schatting, geen aangifte en geen persoonlijk advies.
          </p>
        </Card>
      </section>

      {tips.length > 0 && (
        <section>
          <h2 className="display mb-3 text-[15px] font-semibold">Slim met je belasting</h2>
          <div className="space-y-2.5">
            {tips.map((t) => (
              <Card key={t.sleutel} className="flex gap-2.5 p-4">
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-warn" />
                <p className="text-[13px] leading-relaxed">{t.tekst}</p>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Bedragen zijn berekend met de regels van je jaar en je antwoorden. Doe alleen uitgaven die je ook zonder de belastingvoordelen nodig hebt: een euro uitgeven om minder dan een euro te besparen is nooit winst.</p>
        </section>
      )}

      <section>
        <h2 className="display mb-3 text-[15px] font-semibold">Leren</h2>
        <div className="space-y-2">
          {LEERKAARTEN.map((k) => (
            <details key={k.id} className="rounded-md border border-line bg-white px-4 py-1 text-[13px]">
              <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium">
                <ChevronDown size={14} className="shrink-0" /> {k.titel}
              </summary>
              <p className="pb-3 leading-relaxed text-muted">{k.tekst}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
