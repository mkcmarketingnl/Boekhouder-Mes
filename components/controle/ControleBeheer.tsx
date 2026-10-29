"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { markeerAfgehandeld, openDocument, pasBevindingToe } from "@/lib/controleActies";
import { formatCurrency, formatDate } from "@/lib/format";
import { actueleBevindingen, type Bevinding, type OpgeslagenTx, type ScanUitkomst } from "@/lib/administratiecontrole";
import type { SnelleUitkomst } from "@/lib/snelleControles";

export interface ControleDoc {
  documentId: string;
  fileUrl: string;
  titel: string;
  datum: string;
  bedrag: number;
  type: "kosten" | "omzet";
  txs: OpgeslagenTx[];
}

export interface ControleRij {
  document_id: string;
  uitslag: "klopt" | "afwijking" | "niet_zeker" | "mislukt";
  bevindingen: Bevinding[];
  scan_meldingen: string[];
  scan_onzeker: boolean;
  gecontroleerd_op: string;
  afgehandeld: string[];
  // de bewaarde scan (migratie 0011): daarmee worden de verschillen steeds opnieuw berekend tegen wat er nu is opgeslagen
  scan?: ScanUitkomst | null;
}

interface Keuze {
  sleutel: string;
  label: string;
  isAangifte: boolean;
}

const PARALLEL = 3;

function ErnstPil({ ernst }: { ernst: Bevinding["ernst"] }) {
  const stijl = ernst === "hoog" ? "bg-stamp-bg text-stamp" : ernst === "midden" ? "bg-warn-bg text-warn" : "bg-paper-dark text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${stijl}`}>{ernst === "hoog" ? "Belangrijk" : ernst === "midden" ? "Let op" : "Klein"}</span>;
}

export function ControleBeheer({
  userId,
  keuzes,
  gekozen,
  docs,
  startControles,
  heeftScanKolom,
  snel,
  aantalBoekingen,
}: {
  userId: string;
  tijdvak: string;
  keuzes: Keuze[];
  gekozen: Keuze & { begin: string };
  docs: ControleDoc[];
  startControles: ControleRij[];
  heeftScanKolom: boolean;
  snel: SnelleUitkomst;
  aantalBoekingen: number;
}) {
  const router = useRouter();
  const [verversen, startVerversen] = useTransition();
  const [controles, setControles] = useState<Record<string, ControleRij>>(() => Object.fromEntries(startControles.map((c) => [c.document_id, c])));
  const [bezig, setBezig] = useState(false);
  const [gedaan, setGedaan] = useState(0);
  const [totaal, setTotaal] = useState(0);
  const [fouten, setFouten] = useState(0);
  const [melding, setMelding] = useState<string | null>(null);
  const [kaartFout, setKaartFout] = useState<Record<string, string>>({});
  const [kaartOk, setKaartOk] = useState<Record<string, string>>({});
  const [toegepast, setToegepast] = useState<Record<string, string>>({});
  const [bezigMet, setBezigMet] = useState<string | null>(null);
  const stop = useRef(false);

  // Nog te scannen: documenten zonder uitkomst, en (zodra de bewaarde scan bestaat) uitkomsten uit de eerste versie
  const nogTeDoen = docs.filter((d) => {
    const c = controles[d.documentId];
    if (!c) return true;
    return heeftScanKolom && !c.scan;
  });
  const gecontroleerd = docs.length - nogTeDoen.length;

  // De verschillen worden bij elke weergave opnieuw berekend tegen wat er NU is opgeslagen
  const rijen = docs
    .map((doc) => {
      const c = controles[doc.documentId];
      if (!c) return null;
      return { doc, c, actueel: actueleBevindingen(doc.txs, c.scan ?? null, c.bevindingen ?? [], c.afgehandeld ?? []) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const metAfwijking = rijen.filter((x) => x.actueel.bevindingen.length > 0);
  const nietZeker = rijen.filter((x) => x.actueel.bevindingen.length === 0 && (x.c.uitslag === "mislukt" || x.actueel.uitslag === "niet_zeker") && !(x.c.afgehandeld ?? []).includes("gezien"));
  const klopt = rijen.length - metAfwijking.length - nietZeker.length;

  async function start(opnieuw: boolean) {
    const lijst = opnieuw ? [...docs] : [...nogTeDoen];
    if (lijst.length === 0) return;
    stop.current = false;
    setBezig(true);
    setMelding(null);
    setFouten(0);
    setGedaan(0);
    setTotaal(lijst.length);
    let volgende = 0;

    async function werker() {
      while (!stop.current) {
        const i = volgende++;
        if (i >= lijst.length) return;
        const doc = lijst[i];
        try {
          const res = await fetch("/api/controle/document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: doc.documentId }) });
          const json = await res.json().catch(() => ({}));
          if (res.status === 409 || res.status === 429) {
            setMelding(json?.error ?? "De controle kan nu niet verder.");
            stop.current = true;
            return;
          }
          if (!res.ok || !json?.data) {
            setFouten((f) => f + 1);
          } else {
            setControles((c) => ({ ...c, [doc.documentId]: json.data as ControleRij }));
          }
        } catch {
          setFouten((f) => f + 1);
        }
        setGedaan((g) => g + 1);
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, lijst.length) }, () => werker()));
    setBezig(false);
    startVerversen(() => router.refresh());
  }

  async function pasToe(doc: ControleDoc, b: Bevinding) {
    setBezigMet(b.id);
    setKaartFout((f) => ({ ...f, [doc.documentId]: "" }));
    setKaartOk((f) => ({ ...f, [doc.documentId]: "" }));
    const res = await pasBevindingToe(userId, doc.documentId, b);
    setBezigMet(null);
    if (res.error) {
      setKaartFout((f) => ({ ...f, [doc.documentId]: res.error ?? "Aanpassen is mislukt." }));
      return;
    }
    // Pas als de pagina met de opgeslagen gegevens is ververst, zien we of het verschil echt weg is
    setToegepast((t) => ({ ...t, [doc.documentId]: b.id }));
    startVerversen(() => router.refresh());
  }

  async function laatStaan(doc: ControleDoc, c: ControleRij, id: string) {
    setBezigMet(id);
    const res = await markeerAfgehandeld(userId, doc.documentId, c.afgehandeld ?? [], id);
    setBezigMet(null);
    if (res.error) {
      setKaartFout((f) => ({ ...f, [doc.documentId]: res.error ?? "Opslaan is mislukt." }));
      return;
    }
    setControles((cs) => ({ ...cs, [doc.documentId]: { ...c, afgehandeld: res.afgehandeld } }));
  }

  async function bekijk(doc: ControleDoc) {
    const ok = await openDocument(doc.fileUrl);
    if (!ok) setKaartFout((f) => ({ ...f, [doc.documentId]: "Het document kon niet worden geopend." }));
  }

  const minuten = Math.max(1, Math.ceil((nogTeDoen.length * 8) / PARALLEL / 60));
  const snelAantal = snel.dubbel.length + snel.horecaEenTarief.length + snel.handmatig.length;

  return (
    <div className="space-y-6">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Tijdvak">
        {keuzes.map((k) => (
          <Link
            key={k.sleutel}
            href={`/controle?periode=${k.sleutel}`}
            scroll={false}
            role="tab"
            aria-selected={k.sleutel === gekozen.sleutel}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] ${k.sleutel === gekozen.sleutel ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink hover:border-ink/40"}`}
          >
            {k.label}
            {k.isAangifte && <span className={`text-[10.5px] ${k.sleutel === gekozen.sleutel ? "opacity-80" : "text-muted"}`}>aangifte</span>}
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck size={16} className="text-stamp" />
          <h2 className="display text-[15px] font-semibold">
            Controle {gekozen.label}
            {gekozen.isAangifte && " (je volgende BTW-aangifte)"}
          </h2>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted">
          We scannen de documenten uit dit tijdvak opnieuw met de nieuwste scan en vergelijken het resultaat met wat je hebt opgeslagen: bedrag, BTW-tarieven (ook 9% en 21% op één bon), datum, soort (omzet of kosten) en ingehouden kosten. Er wordt niets automatisch gewijzigd; jij beslist per verschil.
        </p>
        <div className="mono mt-3 text-[13px]">
          {aantalBoekingen} {aantalBoekingen === 1 ? "boeking" : "boekingen"} · {docs.length} {docs.length === 1 ? "document" : "documenten"} · {gecontroleerd} gecontroleerd · {metAfwijking.length} met een verschil
        </div>

        {bezig ? (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-paper-dark" role="progressbar" aria-valuenow={totaal ? Math.round((gedaan / totaal) * 100) : 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-ink" style={{ width: `${totaal ? (gedaan / totaal) * 100 : 0}%` }} />
            </div>
            <p className="mt-2 flex items-center gap-2 text-[12.5px] text-muted" aria-live="polite">
              <Loader2 size={14} className="spin" /> {gedaan} van {totaal} gecontroleerd. Laat dit scherm open staan.
            </p>
            <Button type="button" variant="ghost" onClick={() => (stop.current = true)} className="mt-2">
              Stoppen
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center">
            {nogTeDoen.length > 0 ? (
              <Button type="button" onClick={() => start(false)} className="justify-center">
                Controleer {nogTeDoen.length} {nogTeDoen.length === 1 ? "document" : "documenten"}
              </Button>
            ) : (
              docs.length > 0 && (
                <p className="flex items-center gap-2 text-[13px] text-ok">
                  <CheckCircle2 size={15} /> Alle documenten in dit tijdvak zijn gecontroleerd.
                </p>
              )
            )}
            {gecontroleerd > 0 && (
              <button type="button" onClick={() => start(true)} className="inline-flex min-h-11 items-center text-[12.5px] text-muted underline">
                Alles opnieuw controleren
              </button>
            )}
          </div>
        )}
        {!bezig && nogTeDoen.length > 0 && <p className="mt-2 text-[11.5px] text-muted">Duurt ongeveer {minuten} {minuten === 1 ? "minuut" : "minuten"}. Laat dit tabblad open staan terwijl de controle loopt.</p>}
        {!heeftScanKolom && docs.length > 0 && <p className="mt-2 text-[11.5px] text-muted">Tip: na de database-update 0011 blijven verschillen automatisch kloppen met wat je aanpast. Tot die tijd kan een eerder gevonden verschil blijven staan.</p>}
        {melding && <p className="mt-3 rounded-md border border-warn/30 bg-warn-bg px-3.5 py-2.5 text-[13px]">{melding}</p>}
        {fouten > 0 && !bezig && <p className="mt-3 text-[12.5px] text-stamp">{fouten} {fouten === 1 ? "document kon" : "documenten konden"} niet worden gecontroleerd. Probeer het later nog eens.</p>}
        {docs.length === 0 && <p className="mt-3 text-[12.5px] text-muted">In dit tijdvak zijn geen gescande documenten met een boeking om te controleren.</p>}
        <p className="mt-3 text-[12.5px]">
          <Link href="/btw" className="underline">Naar je BTW-aangifte</Link> <span className="text-muted">(daar zie je welke facturen in omzet en voorbelasting zitten)</span>
        </p>
      </Card>

      {metAfwijking.length > 0 && (
        <section>
          <h2 className="display mb-3 text-[15px] font-semibold">Verschillen gevonden ({metAfwijking.length})</h2>
          <div className="space-y-4">
            {metAfwijking.map(({ doc, c, actueel }) => (
              <Card key={doc.documentId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium">{doc.titel}</div>
                    <div className="mono text-[11.5px] text-muted">
                      {formatDate(doc.datum)} · {doc.type === "omzet" ? "omzet" : "kosten"} · {formatCurrency(doc.bedrag)}
                    </div>
                  </div>
                  <button type="button" onClick={() => bekijk(doc)} className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] text-ink underline">
                    <ExternalLink size={13} /> Bekijk document
                  </button>
                </div>

                {actueel.scanOnzeker && (
                  <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12px] leading-relaxed">
                    <AlertTriangle size={12} className="mr-1 inline" /> De controle-scan was zelf niet helemaal zeker. Kijk eerst in het document voordat je iets aanpast.
                  </p>
                )}

                <ul className="mt-3 space-y-3">
                  {actueel.bevindingen.map((b) => (
                    <li key={b.id} className="rounded-md border border-line p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <ErnstPil ernst={b.ernst} />
                        <strong className="text-[13px]">{b.titel}</strong>
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-muted">{b.uitleg}</p>
                      {(b.opgeslagen || b.scan) && (
                        <dl className="mono mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                          <dt className="text-muted">Opgeslagen</dt>
                          <dd>{b.opgeslagen ?? "—"}</dd>
                          <dt className="text-muted">Op het document</dt>
                          <dd className="font-semibold">{b.scan ?? "—"}</dd>
                        </dl>
                      )}
                      <div className="mt-3 flex flex-col gap-2 min-[480px]:flex-row">
                        {b.fix.soort !== "geen" && (
                          <Button type="button" onClick={() => pasToe(doc, b)} loading={bezigMet === b.id || (verversen && toegepast[doc.documentId] === b.id)} disabled={(bezigMet !== null && bezigMet !== b.id) || verversen} className="justify-center">
                            {b.fix.soort === "voeg_kosten_toe" ? "Voeg de kosten toe" : b.fix.soort === "zet_btw_regels" ? "Zet de BTW-verdeling goed" : "Pas aan naar het document"}
                          </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={() => laatStaan(doc, c, b.id)} disabled={bezigMet !== null || verversen} className="justify-center">
                          {b.fix.soort === "geen" ? "Gezien" : "Laat zoals het is"}
                        </Button>
                      </div>
                      {!verversen && toegepast[doc.documentId] === b.id && (
                        <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12px]" role="alert">
                          De aanpassing is opgeslagen, maar dit verschil staat er nog. Kijk de boeking na op de pagina Dashboard of pas hem daar zelf aan.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {kaartFout[doc.documentId] && (
                  <p className="mt-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
                    {kaartFout[doc.documentId]}
                  </p>
                )}
                {kaartOk[doc.documentId] && <p className="mt-3 text-[12.5px] text-ok">{kaartOk[doc.documentId]}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      {nietZeker.length > 0 && (
        <section>
          <h2 className="display mb-1 text-[15px] font-semibold">Niet zeker ({nietZeker.length})</h2>
          <p className="mb-3 text-[12.5px] text-muted">Bij deze documenten kon de scan niet met zekerheid zeggen of alles klopt. Kijk zelf even in het document.</p>
          <div className="space-y-2.5">
            {nietZeker.map(({ doc, c, actueel }) => (
              <Card key={doc.documentId} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium">{doc.titel}</div>
                    <div className="mono text-[11.5px] text-muted">
                      {formatDate(doc.datum)} · {formatCurrency(doc.bedrag)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => bekijk(doc)} className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] underline">
                      <ExternalLink size={13} /> Bekijk
                    </button>
                    <button type="button" onClick={() => laatStaan(doc, c, "gezien")} className="inline-flex min-h-11 items-center text-[12.5px] text-muted underline">
                      Gezien
                    </button>
                  </div>
                </div>
                {actueel.scanMeldingen.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-muted">
                    {actueel.scanMeldingen.slice(0, 4).map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {gecontroleerd > 0 && !bezig && metAfwijking.length === 0 && nietZeker.length === 0 && (
        <p className="flex items-center gap-2 text-[13px] text-ok">
          <CheckCircle2 size={15} /> Geen verschillen gevonden bij de {klopt} gecontroleerde documenten.
        </p>
      )}
      {klopt > 0 && (metAfwijking.length > 0 || nietZeker.length > 0) && <p className="text-[12.5px] text-muted">{klopt} {klopt === 1 ? "document klopt" : "documenten kloppen"} met wat er is opgeslagen.</p>}

      {snelAantal > 0 && (
        <section>
          <h2 className="display mb-1 text-[15px] font-semibold">Snelle controles ({snelAantal})</h2>
          <p className="mb-3 text-[12.5px] text-muted">Dingen die je direct aan je boekingen kunt zien, zonder scan. Het zijn aanwijzingen om na te kijken, geen vaststaande fouten.</p>
          <div className="space-y-3">
            {snel.horecaEenTarief.length > 0 && (
              <Card className="p-4">
                <strong className="text-[13px]">Horeca met maar één BTW-tarief ({snel.horecaEenTarief.length})</strong>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Op restaurantbonnen staat vaak 9% (eten) én 21% (drank). Deze boekingen staan op één tarief. Scan ze opnieuw met de knop hierboven, dan stelt de controle de juiste verdeling voor.</p>
                <ul className="mono mt-2 space-y-0.5 text-[12px]">
                  {snel.horecaEenTarief.slice(0, 15).map((t) => (
                    <li key={t.id}>
                      {formatDate(t.factuurdatum)} · {t.leverancier} · {formatCurrency(t.bedrag_incl_btw)} · {t.btw_percentage}%
                    </li>
                  ))}
                </ul>
                {snel.horecaEenTarief.length > 15 && <p className="mt-1 text-[11.5px] text-muted">en {snel.horecaEenTarief.length - 15} meer</p>}
              </Card>
            )}
            {snel.dubbel.length > 0 && (
              <Card className="p-4">
                <strong className="text-[13px]">Mogelijk dubbel ({snel.dubbel.length})</strong>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Zelfde factuurnummer, of zelfde partij, datum en bedrag. Dubbel opgevoerde facturen tellen twee keer mee in je omzet of voorbelasting.</p>
                <ul className="mt-2 space-y-1.5 text-[12.5px]">
                  {snel.dubbel.slice(0, 15).map((g, i) => (
                    <li key={i} className="mono text-[12px]">
                      {g.leverancier} · {g.txs.length}× {g.reden === "nummer" ? "zelfde nummer" : "zelfde datum en bedrag"} · {g.txs.map((t) => formatDate(t.factuurdatum)).join(", ")} · {formatCurrency(g.txs[0].bedrag_incl_btw)}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {snel.handmatig.length > 0 && (
              <Card className="p-4">
                <strong className="text-[13px]">Zonder document ({snel.handmatig.length})</strong>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Deze boekingen zijn handmatig ingevoerd. Er is geen document om te scannen, dus controleer ze zelf.</p>
                <ul className="mono mt-2 space-y-0.5 text-[12px]">
                  {snel.handmatig.slice(0, 15).map((t) => (
                    <li key={t.id}>
                      {formatDate(t.factuurdatum)} · {t.type === "omzet" ? "omzet" : "kosten"} · {t.leverancier} · {formatCurrency(t.bedrag_incl_btw)}
                    </li>
                  ))}
                </ul>
                {snel.handmatig.length > 15 && <p className="mt-1 text-[11.5px] text-muted">en {snel.handmatig.length - 15} meer</p>}
              </Card>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
