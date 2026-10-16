"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { bewaarVerplichting, markeerVerplichtingBetaald, verwijderVerplichting } from "@/lib/actions/geld";
import { sorteerVerplichtingen, verplichtingStatus, verplichtingenSamenvatting, type GeldVerplichting } from "@/lib/geld";
import { formatCurrency, formatDate } from "@/lib/format";

const e = (n: number) => formatCurrency(n);

function Formulier({ start, onKlaar }: { start?: GeldVerplichting; onKlaar: () => void }) {
  const router = useRouter();
  const [naam, setNaam] = useState(start?.naam ?? "");
  const [bedrag, setBedrag] = useState(start?.bedrag ?? 0);
  const [deadline, setDeadline] = useState(start?.deadline ?? "");
  const [instantie, setInstantie] = useState(start?.instantie ?? "");
  const [notitie, setNotitie] = useState(start?.notitie ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function opslaan(ev: React.FormEvent) {
    ev.preventDefault();
    setBezig(true);
    setFout(null);
    const res = await bewaarVerplichting({ naam, bedrag, deadline, instantie, notitie }, start?.id);
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
      <Field label="Wat moet je betalen?">
        <Input value={naam} onChange={(ev) => setNaam(ev.target.value)} placeholder="Bijv. Terugbetaling zorgtoeslag 2023" maxLength={80} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <Field label="Bedrag dat je nog moet betalen (€)">
          <DecimalInput value={bedrag} onValueChange={setBedrag} />
        </Field>
        <Field label="Uiterlijk betalen op" hint="Staat meestal op de brief of aanmaning.">
          <Input type="date" value={deadline} onChange={(ev) => setDeadline(ev.target.value)} />
        </Field>
      </div>
      <Field label="Bij wie? (optioneel)">
        <Input value={instantie} onChange={(ev) => setInstantie(ev.target.value)} placeholder="Bijv. Belastingdienst, Toeslagen, energieleverancier" maxLength={80} autoComplete="off" />
      </Field>
      <Field label="Notitie (optioneel)" hint="Bijv. een kenmerk of betalingsregeling.">
        <Textarea rows={2} value={notitie} onChange={(ev) => setNotitie(ev.target.value)} maxLength={300} className="min-h-0" />
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

const STATUS_KLEUR = { te_laat: "text-stamp", vandaag: "text-stamp", binnenkort: "text-warn", later: "text-muted", betaald: "text-ok" } as const;

function statusTekst(s: ReturnType<typeof verplichtingStatus>, betaaldOp: string | null): string {
  if (s.status === "betaald") return `Betaald op ${betaaldOp ? formatDate(betaaldOp) : "—"}`;
  if (s.status === "te_laat") return `${-s.dagen} ${-s.dagen === 1 ? "dag" : "dagen"} te laat`;
  if (s.status === "vandaag") return "Vandaag deadline";
  return `Nog ${s.dagen} ${s.dagen === 1 ? "dag" : "dagen"}`;
}

export function VerplichtingenSectie({ verplichtingen, beschikbaar, vandaag, voorDoelen }: { verplichtingen: GeldVerplichting[]; beschikbaar: boolean; vandaag: string; voorDoelen: number }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | "nieuw" | null>(null);
  const [toonBetaald, setToonBetaald] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const gesorteerd = useMemo(() => sorteerVerplichtingen(verplichtingen), [verplichtingen]);
  const sam = useMemo(() => verplichtingenSamenvatting(verplichtingen, vandaag), [verplichtingen, vandaag]);
  const zichtbaar = gesorteerd.filter((v) => toonBetaald || !v.betaald_op);
  const aantalBetaald = gesorteerd.filter((v) => v.betaald_op).length;

  if (!beschikbaar) {
    return (
      <section>
        <h2 className="display mb-3 text-[15px] font-semibold">Te betalen met een deadline</h2>
        <Card className="border-warn/30 bg-warn-bg p-5">
          <p className="text-[13px] leading-relaxed">Dit onderdeel heeft een eenmalige database-update nodig (migratie 0009_geld_verplichtingen.sql in Supabase). Zodra dat is gedaan werkt het meteen.</p>
        </Card>
      </section>
    );
  }

  async function betaald(v: GeldVerplichting, waarde: string | null) {
    setFout(null);
    const res = await markeerVerplichtingBetaald(v.id, waarde);
    if (res.fout) setFout(res.fout);
    else router.refresh();
  }

  async function verwijder(v: GeldVerplichting) {
    if (!window.confirm(`${v.naam} verwijderen?`)) return;
    const res = await verwijderVerplichting(v.id);
    if (res.fout) setFout(res.fout);
    else router.refresh();
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[15px] font-semibold">Te betalen met een deadline</h2>
        {sam.aantalOpen > 0 && <span className="mono text-[12px] text-muted">{e(sam.totaalOpen)} open</span>}
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted">Een achterstand, aanmaning of terugbetaling waar een deadline aan hangt? Zet het hier neer. Je krijgt een melding op je overzicht 14, 7, 3 en 1 dag ervoor, en elke dag zodra de deadline voorbij is, tot je het als betaald markeert. Dit staat los van je maandoverzicht hierboven.</p>

      {sam.aantalOpen > 0 && (
        <Card className="mb-3 p-4 text-[12.5px] leading-relaxed">
          <p>
            De komende 30 dagen moet je <strong>{e(sam.binnen30Dagen)}</strong> betalen{sam.aantalTeLaat > 0 ? `, waarvan ${e(sam.bedragTeLaat)} al te laat is` : ""}.
            {voorDoelen !== 0 && <span className="text-muted"> Je houdt per maand ongeveer {e(voorDoelen)} over na je vaste lasten en speelruimte.</span>}
          </p>
          <a href="/api/geld/agenda" download className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-medium text-ink underline">
            <CalendarPlus size={14} /> Alle deadlines in mijn agenda zetten
          </a>
        </Card>
      )}

      {fout && (
        <p className="mb-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
          {fout}
        </p>
      )}

      <div className="space-y-2.5">
        {zichtbaar.length === 0 && open !== "nieuw" && (
          <Card className="p-5">
            <p className="text-[12.5px] leading-relaxed text-muted">Niets openstaand. Heb je een brief gekregen met een bedrag en een deadline? Voeg hem toe, dan vergeet je hem niet.</p>
          </Card>
        )}
        {zichtbaar.map((v) => {
          const s = verplichtingStatus(v, vandaag);
          return (
            <Card key={v.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">{v.naam}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-muted">
                    {v.instantie ? `${v.instantie} · ` : ""}deadline {formatDate(v.deadline)}
                  </div>
                  <div className={`mt-0.5 text-[12px] font-medium ${STATUS_KLEUR[s.status]}`}>{statusTekst(s, v.betaald_op)}</div>
                  {v.notitie && <div className="mt-1 text-[12px] text-muted">{v.notitie}</div>}
                </div>
                <div className="mono shrink-0 text-[14px] font-semibold">{e(v.bedrag)}</div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0">
                {v.betaald_op ? (
                  <button type="button" onClick={() => betaald(v, null)} className="inline-flex min-h-11 items-center px-2 text-[12.5px] text-muted underline">
                    Toch niet betaald
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => betaald(v, vandaag)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[12.5px] font-medium hover:bg-paper-dark">
                      <CheckCircle2 size={14} /> Betaald
                    </button>
                    <a href={`/api/geld/agenda?id=${v.id}`} download className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[12.5px] text-muted hover:text-ink">
                      <CalendarPlus size={14} /> Agenda
                    </a>
                  </>
                )}
                <button type="button" onClick={() => setOpen(open === v.id ? null : v.id)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink" aria-label={`${v.naam} aanpassen`} aria-expanded={open === v.id}>
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => verwijder(v)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp" aria-label={`${v.naam} verwijderen`}>
                  <Trash2 size={14} />
                </button>
              </div>
              {open === v.id && <Formulier start={v} onKlaar={() => setOpen(null)} />}
            </Card>
          );
        })}

        {open === "nieuw" ? (
          <Card className="p-4">
            <Formulier onKlaar={() => setOpen(null)} />
          </Card>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4">
            <Button type="button" variant="secondary" onClick={() => setOpen("nieuw")} className="w-full justify-center min-[480px]:w-auto">
              <Plus size={15} /> Verplichting toevoegen
            </Button>
            {aantalBetaald > 0 && (
              <button type="button" onClick={() => setToonBetaald((t) => !t)} className="inline-flex min-h-11 items-center text-[12.5px] text-muted underline">
                {toonBetaald ? "Betaalde verbergen" : `Betaalde tonen (${aantalBetaald})`}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
