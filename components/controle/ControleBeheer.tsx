"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { markeerAfgehandeld, openDocument, pasBevindingToe } from "@/lib/controleActies";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Bevinding } from "@/lib/administratiecontrole";

export interface ControleDoc {
  documentId: string;
  fileUrl: string;
  titel: string;
  datum: string;
  bedrag: number;
  type: "kosten" | "omzet";
}

export interface ControleRij {
  document_id: string;
  uitslag: "klopt" | "afwijking" | "niet_zeker" | "mislukt";
  bevindingen: Bevinding[];
  scan_meldingen: string[];
  scan_onzeker: boolean;
  gecontroleerd_op: string;
  afgehandeld: string[];
}

const PARALLEL = 3;

function ErnstPil({ ernst }: { ernst: Bevinding["ernst"] }) {
  const stijl = ernst === "hoog" ? "bg-stamp-bg text-stamp" : ernst === "midden" ? "bg-warn-bg text-warn" : "bg-paper-dark text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${stijl}`}>{ernst === "hoog" ? "Belangrijk" : ernst === "midden" ? "Let op" : "Klein"}</span>;
}

export function ControleBeheer({ userId, docs, startControles }: { userId: string; docs: ControleDoc[]; startControles: ControleRij[] }) {
  const router = useRouter();
  const [controles, setControles] = useState<Record<string, ControleRij>>(() => Object.fromEntries(startControles.map((c) => [c.document_id, c])));
  const [bezig, setBezig] = useState(false);
  const [gedaan, setGedaan] = useState(0);
  const [totaal, setTotaal] = useState(0);
  const [fouten, setFouten] = useState(0);
  const [melding, setMelding] = useState<string | null>(null);
  const [kaartFout, setKaartFout] = useState<Record<string, string>>({});
  const [bezigMet, setBezigMet] = useState<string | null>(null);
  const stop = useRef(false);

  const nogTeDoen = docs.filter((d) => !controles[d.documentId]);
  const gecontroleerd = docs.length - nogTeDoen.length;
  const rijen = docs.map((d) => ({ doc: d, c: controles[d.documentId] })).filter((x): x is { doc: ControleDoc; c: ControleRij } => !!x.c);
  const metAfwijking = rijen.filter((x) => x.c.uitslag === "afwijking" && x.c.bevindingen.some((b) => !x.c.afgehandeld.includes(b.id)));
  const nietZeker = rijen.filter((x) => (x.c.uitslag === "niet_zeker" || x.c.uitslag === "mislukt") && !x.c.afgehandeld.includes("gezien"));
  const klopt = rijen.filter((x) => x.c.uitslag === "klopt" || (x.c.uitslag === "afwijking" && x.c.bevindingen.every((b) => x.c.afgehandeld.includes(b.id)))).length;

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
    router.refresh();
  }

  async function pasToe(doc: ControleDoc, c: ControleRij, b: Bevinding) {
    setBezigMet(b.id);
    setKaartFout((f) => ({ ...f, [doc.documentId]: "" }));
    const res = await pasBevindingToe(userId, doc.documentId, b);
    if (res.error) {
      setKaartFout((f) => ({ ...f, [doc.documentId]: res.error ?? "Aanpassen is mislukt." }));
      setBezigMet(null);
      return;
    }
    await laatStaan(doc, c, b.id);
    router.refresh();
  }

  async function laatStaan(doc: ControleDoc, c: ControleRij, id: string) {
    setBezigMet(id);
    const res = await markeerAfgehandeld(userId, doc.documentId, c.afgehandeld, id);
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

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck size={16} className="text-stamp" />
          <h2 className="display text-[15px] font-semibold">Controleer je eerder geüploade facturen</h2>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Onze scan wordt steeds beter, bijvoorbeeld in het herkennen van ingehouden kosten zoals factoring. Hier scannen we je al geüploade documenten opnieuw en vergelijken we het resultaat met wat je hebt opgeslagen. Je hoeft niets opnieuw te uploaden en er wordt niets automatisch gewijzigd: jij beslist per verschil.
        </p>
        <div className="mono mt-3 text-[13px]">
          {docs.length} {docs.length === 1 ? "document" : "documenten"} · {gecontroleerd} gecontroleerd · {metAfwijking.length} met een verschil
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
                  <CheckCircle2 size={15} /> Alles is gecontroleerd.
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
        {!bezig && nogTeDoen.length > 0 && <p className="mt-2 text-[11.5px] text-muted">Duurt ongeveer {minuten} {minuten === 1 ? "minuut" : "minuten"}. Je kunt tussendoor gewoon verder werken in de app als je dit tabblad open laat.</p>}
        {melding && <p className="mt-3 rounded-md border border-warn/30 bg-warn-bg px-3.5 py-2.5 text-[13px]">{melding}</p>}
        {fouten > 0 && !bezig && <p className="mt-3 text-[12.5px] text-stamp">{fouten} {fouten === 1 ? "document kon" : "documenten konden"} niet worden gecontroleerd. Probeer het later nog eens.</p>}
        {docs.length === 0 && <p className="mt-3 text-[12.5px] text-muted">Er zijn nog geen gescande documenten met een boeking om te controleren.</p>}
      </Card>

      {metAfwijking.length > 0 && (
        <section>
          <h2 className="display mb-3 text-[15px] font-semibold">Verschillen gevonden ({metAfwijking.length})</h2>
          <div className="space-y-4">
            {metAfwijking.map(({ doc, c }) => (
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

                {c.scan_onzeker && (
                  <p className="mt-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[12px] leading-relaxed">
                    <AlertTriangle size={12} className="mr-1 inline" /> De controle-scan was zelf niet helemaal zeker. Kijk eerst in het document voordat je iets aanpast.
                  </p>
                )}

                <ul className="mt-3 space-y-3">
                  {c.bevindingen
                    .filter((b) => !c.afgehandeld.includes(b.id))
                    .map((b) => (
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
                            <Button type="button" onClick={() => pasToe(doc, c, b)} loading={bezigMet === b.id} disabled={bezigMet !== null && bezigMet !== b.id} className="justify-center">
                              {b.fix.soort === "voeg_kosten_toe" ? "Voeg de kosten toe" : "Pas aan naar het document"}
                            </Button>
                          )}
                          <Button type="button" variant="secondary" onClick={() => laatStaan(doc, c, b.id)} disabled={bezigMet !== null} className="justify-center">
                            {b.fix.soort === "geen" ? "Gezien" : "Laat zoals het is"}
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
                {kaartFout[doc.documentId] && (
                  <p className="mt-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
                    {kaartFout[doc.documentId]}
                  </p>
                )}
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
            {nietZeker.map(({ doc, c }) => (
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
                {c.scan_meldingen.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-muted">
                    {c.scan_meldingen.slice(0, 4).map((m) => (
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
    </div>
  );
}
