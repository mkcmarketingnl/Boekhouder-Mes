"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import {
  bewaarDoel,
  bewaarGeldInstellingen,
  bewaarPost,
  verwijderDoel,
  verwijderPost,
  verwijderUitgave,
  voegUitgaveToe,
} from "@/lib/actions/geld";
import { aflossingPlan, doelPlannen, maandOverzicht, schuldenSamenvatting, speelruimteStand, structureelBoven, type DoelPlan, type GeldDoel, type GeldPost, type PostSoort } from "@/lib/geld";
import type { GeldInstellingen, UitgaveRij } from "@/lib/geldDb";
import { formatCurrency, formatDate } from "@/lib/format";

interface Props {
  vandaag: string;
  inkomenAuto: { perMaand: number; betrouwbaar: boolean } | null;
  autoUitleg: string;
  instellingen: GeldInstellingen;
  posten: GeldPost[];
  uitgaven: UitgaveRij[];
  doelen: GeldDoel[];
}

const e = (n: number) => formatCurrency(n);
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const maandNaam = (m: string) => `${MAANDEN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const korteMaand = (d: string) => `${MAANDEN[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

function Melding({ tekst }: { tekst: string | null }) {
  if (!tekst) return null;
  return (
    <p className="mb-3 rounded-md border border-stamp/25 bg-stamp-bg px-3.5 py-2.5 text-[13px]" role="alert">
      {tekst}
    </p>
  );
}

function Balk({ procent, kleur }: { procent: number; kleur: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-paper-dark" role="progressbar" aria-valuenow={Math.round(Math.min(100, procent))} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${kleur}`} style={{ width: `${Math.min(100, Math.max(0, procent))}%` }} />
    </div>
  );
}

// ---------- posten ----------

const SOORT_TEKST: Record<PostSoort, { titel: string; leeg: string; naamHint: string; bedragLabel: string }> = {
  vaste_last: { titel: "Vaste lasten", leeg: "Nog geen vaste lasten. Denk aan huur of hypotheek, zorgverzekering, energie, internet en abonnementen.", naamHint: "Bijv. Huur", bedragLabel: "Per maand" },
  schuld: { titel: "Schulden en afbetalingen", leeg: "Geen schulden toegevoegd. Heb je een auto, telefoon of laptop die je afbetaalt? Zet die hier neer.", naamHint: "Bijv. Auto", bedragLabel: "Aflossing per maand" },
  speelruimte: { titel: "Speelruimte", leeg: "Hier zet je de dingen die je leuk vindt maar niet nodig hebt: uit eten, drankjes, de casino, kleding. Je geeft per post een maandbedrag aan dat je jezelf gunt.", naamHint: "Bijv. Casino, Uit eten", bedragLabel: "Maandbudget" },
};

function PostFormulier({ soort, start, onKlaar }: { soort: PostSoort; start?: GeldPost; onKlaar: () => void }) {
  const router = useRouter();
  const [naam, setNaam] = useState(start?.naam ?? "");
  const [maand, setMaand] = useState(start?.bedrag_maand ?? 0);
  const [rest, setRest] = useState(start?.restschuld ?? 0);
  const [rente, setRente] = useState(start?.rente_percentage ?? 0);
  const [eind, setEind] = useState(start?.einddatum ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const t = SOORT_TEKST[soort];

  async function opslaan(ev: React.FormEvent) {
    ev.preventDefault();
    setBezig(true);
    setFout(null);
    const res = await bewaarPost({ soort, naam, bedrag_maand: maand, ...(soort === "schuld" ? { restschuld: rest, rente_percentage: rente, einddatum: eind || null } : {}) }, start?.id);
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
      <Field label="Naam">
        <Input value={naam} onChange={(ev) => setNaam(ev.target.value)} placeholder={t.naamHint} autoComplete="off" maxLength={80} />
      </Field>
      <Field label={`${t.bedragLabel} (€)`}>
        <DecimalInput value={maand} onValueChange={setMaand} />
      </Field>
      {soort === "schuld" && (
        <>
          <Field label="Nog openstaand (€)" hint="Wat je nog moet afbetalen.">
            <DecimalInput value={rest} onValueChange={setRest} />
          </Field>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field label="Rente per jaar (%)" hint="Laat leeg of 0 als er geen rente is.">
              <DecimalInput value={rente} onValueChange={setRente} />
            </Field>
            <Field label="Einddatum (optioneel)">
              <Input type="date" value={eind} onChange={(ev) => setEind(ev.target.value)} />
            </Field>
          </div>
        </>
      )}
      <Melding tekst={fout} />
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

function PostenSectie({ soort, posten, vandaag }: { soort: PostSoort; posten: GeldPost[]; vandaag: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | "nieuw" | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const t = SOORT_TEKST[soort];
  const eigen = posten.filter((p) => p.soort === soort);
  const totaal = eigen.reduce((a, p) => a + Math.round(p.bedrag_maand * 100), 0) / 100;

  async function verwijder(p: GeldPost) {
    if (!window.confirm(`${p.naam} verwijderen?${soort === "speelruimte" ? " De uitgaven die je hierbij noteerde verdwijnen ook." : ""}`)) return;
    setMelding(null);
    const res = await verwijderPost(p.id);
    if (res.fout) {
      setMelding(res.fout);
      return;
    }
    router.refresh();
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="display text-[15px] font-semibold">{t.titel}</h2>
        {eigen.length > 0 && <span className="mono text-[12px] text-muted">{e(totaal)} per maand</span>}
      </div>
      <Melding tekst={melding} />
      <div className="space-y-2.5">
        {eigen.length === 0 && open !== "nieuw" && (
          <Card className="p-5">
            <p className="text-[12.5px] leading-relaxed text-muted">{t.leeg}</p>
          </Card>
        )}
        {eigen.map((p) => {
          const plan = soort === "schuld" ? aflossingPlan(p, vandaag) : null;
          return (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">{p.naam}</div>
                  {soort === "schuld" && (
                    <div className="mt-0.5 text-[12px] leading-relaxed text-muted">
                      Nog {e(p.restschuld ?? 0)}
                      {p.rente_percentage ? ` · ${String(p.rente_percentage).replace(".", ",")}% rente` : ""}
                      {plan && plan.reden === "ok" && plan.klaarOp && (p.restschuld ?? 0) > 0 ? ` · klaar in ${korteMaand(plan.klaarOp)}` : ""}
                      {plan?.reden === "te_laag" && <span className="block text-stamp">Met dit maandbedrag los je niets af: de rente is hoger.</span>}
                      {plan?.reden === "geen_gegevens" && <span className="block">Vul een maandbedrag in om te zien wanneer je klaar bent.</span>}
                      {p.einddatum && plan?.klaarOp && plan.reden === "ok" && plan.klaarOp > p.einddatum && <span className="block text-warn">Op dit tempo ben je pas na je einddatum ({formatDate(p.einddatum)}) klaar.</span>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  <span className="mono mr-1 text-[14px] font-semibold">{e(p.bedrag_maand)}</span>
                  <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink" aria-label={`${p.naam} aanpassen`} aria-expanded={open === p.id}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => verwijder(p)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp" aria-label={`${p.naam} verwijderen`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {open === p.id && <PostFormulier soort={soort} start={p} onKlaar={() => setOpen(null)} />}
            </Card>
          );
        })}
        {open === "nieuw" ? (
          <Card className="p-4">
            <PostFormulier soort={soort} onKlaar={() => setOpen(null)} />
          </Card>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setOpen("nieuw")} className="w-full justify-center min-[480px]:w-auto">
            <Plus size={15} /> Toevoegen
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------- speelruimte-uitgaven ----------

function SpeelruimteSectie({ posten, uitgaven, vandaag }: { posten: GeldPost[]; uitgaven: UitgaveRij[]; vandaag: string }) {
  const router = useRouter();
  const maand = vandaag.slice(0, 7);
  const stand = useMemo(() => speelruimteStand(posten, uitgaven, maand), [posten, uitgaven, maand]);
  const budgetten = posten.filter((p) => p.soort === "speelruimte");
  const [postId, setPostId] = useState(budgetten[0]?.id ?? "");
  const [bedrag, setBedrag] = useState(0);
  const [datum, setDatum] = useState(vandaag);
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (budgetten.length === 0) return null;
  const gekozen = budgetten.find((p) => p.id === postId) ? postId : budgetten[0].id;
  const dezeMaand = uitgaven.filter((u) => u.datum.startsWith(maand));
  const naam = (id: string) => budgetten.find((p) => p.id === id)?.naam ?? "";

  async function voegToe(ev: React.FormEvent) {
    ev.preventDefault();
    setBezig(true);
    setFout(null);
    const res = await voegUitgaveToe({ post_id: gekozen, datum, bedrag, notitie });
    setBezig(false);
    if (res.fout) {
      setFout(res.fout);
      return;
    }
    setBedrag(0);
    setNotitie("");
    router.refresh();
  }

  async function weg(u: UitgaveRij) {
    const res = await verwijderUitgave(u.id);
    if (res.fout) setFout(res.fout);
    else router.refresh();
  }

  return (
    <section>
      <h2 className="display mb-3 text-[15px] font-semibold">Speelruimte in {maandNaam(maand)}</h2>
      <Card className="p-4">
        <div className="space-y-4">
          {stand.map((s) => {
            const patroon = structureelBoven(uitgaven, s.post, maand);
            return (
              <div key={s.post.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-medium">{s.post.naam}</span>
                  <span className="mono text-[12px] text-muted">
                    {e(s.gebruikt)} van {e(s.budget)}
                  </span>
                </div>
                <Balk procent={s.procent} kleur={s.over < 0 ? "bg-warn" : "bg-ok"} />
                <p className="mt-1 text-[12px] text-muted">
                  {s.over >= 0 ? `Nog ${e(s.over)} over deze maand.` : `${e(-s.over)} boven je ruimte deze maand.`}
                </p>
                {patroon && (
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    Je zit nu drie maanden achter elkaar boven je budget voor {s.post.naam}. Misschien is het budget niet realistisch, of wil je het anders verdelen: dat is jouw keuze, maar dan wel op basis van de cijfers.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={voegToe} className="mt-5 border-t border-line pt-4">
          <h3 className="mb-3 text-[13px] font-medium">Uitgave noteren</h3>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field label="Post">
              <Select value={gekozen} onChange={(ev) => setPostId(ev.target.value)}>
                {budgetten.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.naam}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bedrag (€)">
              <DecimalInput value={bedrag} onValueChange={setBedrag} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field label="Datum">
              <Input type="date" value={datum} max={vandaag} onChange={(ev) => setDatum(ev.target.value)} />
            </Field>
            <Field label="Notitie (optioneel)">
              <Input value={notitie} onChange={(ev) => setNotitie(ev.target.value)} maxLength={200} autoComplete="off" />
            </Field>
          </div>
          <Melding tekst={fout} />
          <Button type="submit" loading={bezig} className="w-full justify-center min-[480px]:w-auto">
            Noteren
          </Button>
        </form>

        {dezeMaand.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {dezeMaand.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 py-1.5 text-[12.5px]">
                <span className="min-w-0 truncate">
                  {formatDate(u.datum)} · {naam(u.post_id)}
                  {u.notitie ? <span className="text-muted"> · {u.notitie}</span> : null}
                </span>
                <span className="flex shrink-0 items-center">
                  <span className="mono">{e(u.bedrag)}</span>
                  <button type="button" onClick={() => weg(u)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp" aria-label="Uitgave verwijderen">
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

// ---------- doelen ----------

const STATUS_TEKST: Record<DoelPlan["status"], { tekst: string; kleur: string }> = {
  gehaald: { tekst: "Gehaald", kleur: "text-ok" },
  haalbaar: { tekst: "Haalbaar", kleur: "text-ok" },
  krap: { tekst: "Haalbaar, maar krap", kleur: "text-warn" },
  niet_haalbaar: { tekst: "Past nog niet", kleur: "text-stamp" },
  geen_ruimte: { tekst: "Geen ruimte over", kleur: "text-stamp" },
  geen_datum: { tekst: "Zonder datum", kleur: "text-muted" },
  overzicht: { tekst: "Overzicht", kleur: "text-muted" },
};

function DoelFormulier({ start, onKlaar }: { start?: GeldDoel; onKlaar: () => void }) {
  const router = useRouter();
  const [naam, setNaam] = useState(start?.naam ?? "");
  const [soort, setSoort] = useState<GeldDoel["soort"]>(start?.soort ?? "sparen");
  const [doel, setDoel] = useState(start?.doel_bedrag ?? 0);
  const [huidig, setHuidig] = useState(start?.huidig_bedrag ?? 0);
  const [datum, setDatum] = useState(start?.streefdatum ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function opslaan(ev: React.FormEvent) {
    ev.preventDefault();
    setBezig(true);
    setFout(null);
    const res = await bewaarDoel({ naam, soort, doel_bedrag: soort === "overzicht" ? null : doel, huidig_bedrag: huidig, streefdatum: datum || null }, start?.id);
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
      <Field label="Wat is je doel?">
        <Input value={naam} onChange={(ev) => setNaam(ev.target.value)} placeholder="Bijv. Porsche, buffer van 6 maanden, meer overzicht" maxLength={80} autoComplete="off" />
      </Field>
      <Field label="Soort doel">
        <Select value={soort} onChange={(ev) => setSoort(ev.target.value as GeldDoel["soort"])}>
          <option value="sparen">Sparen voor iets</option>
          <option value="beleggen">Een bedrag geïnvesteerd hebben</option>
          <option value="overzicht">Meer overzicht en grip (zonder bedrag)</option>
        </Select>
      </Field>
      {soort !== "overzicht" && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field label="Dit wil ik bereiken (€)">
              <DecimalInput value={doel} onValueChange={setDoel} />
            </Field>
            <Field label="Dit heb ik al (€)">
              <DecimalInput value={huidig} onValueChange={setHuidig} />
            </Field>
          </div>
          <Field label="Streefdatum (optioneel)" hint="Zonder datum rekenen we uit wanneer je het haalt met wat je overhoudt.">
            <Input type="date" value={datum} onChange={(ev) => setDatum(ev.target.value)} />
          </Field>
        </>
      )}
      <Melding tekst={fout} />
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

function DoelenSectie({ doelen, voorDoelen, vandaag }: { doelen: GeldDoel[]; voorDoelen: number; vandaag: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | "nieuw" | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const plannen = useMemo(() => doelPlannen(doelen, voorDoelen, vandaag), [doelen, voorDoelen, vandaag]);

  async function verwijder(d: GeldDoel) {
    if (!window.confirm(`${d.naam} verwijderen?`)) return;
    const res = await verwijderDoel(d.id);
    if (res.fout) setMelding(res.fout);
    else router.refresh();
  }

  return (
    <section>
      <h2 className="display mb-3 text-[15px] font-semibold">Doelen</h2>
      <Melding tekst={melding} />
      <div className="space-y-2.5">
        {plannen.length === 0 && open !== "nieuw" && (
          <Card className="p-5">
            <p className="text-[12.5px] leading-relaxed text-muted">Wil je een auto, een buffer of gewoon meer greep op je geld? Zet het hier neer, dan zie je of het past bij wat je overhoudt.</p>
          </Card>
        )}
        {plannen.map((p) => {
          const st = STATUS_TEKST[p.status];
          return (
            <Card key={p.doel.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[14px] font-medium">
                    <Target size={14} className="shrink-0 text-muted" /> {p.doel.naam}
                  </div>
                  <div className={`mt-0.5 text-[12px] font-medium ${st.kleur}`}>{st.tekst}</div>
                </div>
                <div className="flex shrink-0 items-center">
                  <button type="button" onClick={() => setOpen(open === p.doel.id ? null : p.doel.id)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-ink" aria-label={`${p.doel.naam} aanpassen`} aria-expanded={open === p.doel.id}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => verwijder(p.doel)} className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-stamp" aria-label={`${p.doel.naam} verwijderen`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {p.doel.soort !== "overzicht" && (
                <div className="mt-2">
                  <Balk procent={p.procent} kleur={p.status === "gehaald" ? "bg-ok" : "bg-ink"} />
                  <div className="mono mt-1 flex justify-between text-[12px] text-muted">
                    <span>
                      {e(p.doel.huidig_bedrag)} van {e(p.doel.doel_bedrag ?? 0)}
                    </span>
                    <span>{p.procent}%</span>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                    {p.status === "gehaald" && "Dit doel is bereikt."}
                    {(p.status === "haalbaar" || p.status === "krap") && p.nodigPerMaand != null && `Zet ${e(p.nodigPerMaand)} per maand opzij om dit op ${formatDate(p.doel.streefdatum ?? vandaag)} te halen.${p.status === "krap" ? " Dat is bijna alles wat je overhoudt." : ""}`}
                    {p.status === "niet_haalbaar" && p.nodigPerMaand != null && `Hiervoor is ${e(p.nodigPerMaand)} per maand nodig, meer dan er overblijft.${p.haalbaarOp ? ` Met wat er wél overblijft haal je het in ${korteMaand(p.haalbaarOp)}.` : ""}`}
                    {p.status === "geen_ruimte" && "Er blijft na je vaste lasten, aflossingen en speelruimte niets over om hiervoor opzij te zetten. Kijk eerst naar je maandoverzicht hierboven."}
                    {p.status === "geen_datum" && p.haalbaarOp && `Met wat je overhoudt (na je andere doelen) haal je dit in ${korteMaand(p.haalbaarOp)}.`}
                  </p>
                </div>
              )}
              {open === p.doel.id && <DoelFormulier start={p.doel} onKlaar={() => setOpen(null)} />}
            </Card>
          );
        })}
        {open === "nieuw" ? (
          <Card className="p-4">
            <DoelFormulier onKlaar={() => setOpen(null)} />
          </Card>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setOpen("nieuw")} className="w-full justify-center min-[480px]:w-auto">
            <Plus size={15} /> Doel toevoegen
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------- hoofdcomponent ----------

export function GeldBeheer({ vandaag, inkomenAuto, autoUitleg, instellingen, posten, uitgaven, doelen }: Props) {
  const router = useRouter();
  const [bewerkInkomen, setBewerkInkomen] = useState(false);
  const [eigen, setEigen] = useState(instellingen.inkomen_override_maand ?? inkomenAuto?.perMaand ?? 0);
  const [mes, setMes] = useState(instellingen.mes_mag_lezen);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const handmatig = instellingen.inkomen_override_maand != null;
  const inkomen = handmatig ? (instellingen.inkomen_override_maand as number) : (inkomenAuto?.perMaand ?? 0);
  const o = useMemo(() => maandOverzicht(inkomen, posten), [inkomen, posten]);
  const schulden = useMemo(() => schuldenSamenvatting(posten, vandaag), [posten, vandaag]);

  async function slaInstellingenOp(override: number | null, mesToestaan: boolean) {
    setBezig(true);
    setFout(null);
    const res = await bewaarGeldInstellingen({ inkomen_override_maand: override, mes_mag_lezen: mesToestaan });
    setBezig(false);
    if (res.fout) {
      setFout(res.fout);
      return false;
    }
    router.refresh();
    return true;
  }

  const delen = o.inkomen > 0 ? [
    { naam: "Vaste lasten", waarde: o.vasteLasten, kleur: "bg-ink" },
    { naam: "Aflossingen", waarde: o.aflossingen, kleur: "bg-stamp" },
    { naam: "Speelruimte", waarde: o.speelruimte, kleur: "bg-warn" },
    { naam: "Over", waarde: Math.max(0, o.voorDoelen), kleur: "bg-ok" },
  ] : [];

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <div className="mb-1 text-[12px] text-muted">Wat je per maand overhoudt voor doelen en een buffer</div>
        <div className={`mono text-3xl font-semibold ${o.voorDoelen < 0 ? "text-stamp" : "text-ink"}`}>{e(o.voorDoelen)}</div>
        {o.voorDoelen < 0 && <p className="mt-2 text-[12.5px] leading-relaxed text-stamp">Je uitgaven zijn hoger dan je inkomen. Begin bij je vaste lasten en aflossingen; je speelruimte is het laatste dat moet krimpen, maar het is wel het makkelijkste.</p>}

        {delen.length > 0 && (
          <div className="mt-4">
            <div className="flex h-3 overflow-hidden rounded-full bg-paper-dark" role="img" aria-label="Verdeling van je maandinkomen">
              {delen.map((d) => (
                <div key={d.naam} className={d.kleur} style={{ width: `${Math.min(100, (d.waarde / o.inkomen) * 100)}%` }} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
              {delen.map((d) => (
                <li key={d.naam} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${d.kleur}`} /> {d.naam}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="mt-4 divide-y divide-line border-t border-line text-[13px]">
          <li className="flex justify-between py-2">
            <span>Inkomen per maand</span>
            <span className="mono">{e(o.inkomen)}</span>
          </li>
          <li className="flex justify-between py-2 text-muted">
            <span>− Vaste lasten</span>
            <span className="mono">{e(o.vasteLasten)}</span>
          </li>
          <li className="flex justify-between py-2 text-muted">
            <span>− Aflossingen</span>
            <span className="mono">{e(o.aflossingen)}</span>
          </li>
          <li className="flex justify-between py-2 font-medium">
            <span>Over na vaste lasten</span>
            <span className="mono">{e(o.naVastEnAflossing)}</span>
          </li>
          <li className="flex justify-between py-2 text-muted">
            <span>− Speelruimte</span>
            <span className="mono">{e(o.speelruimte)}</span>
          </li>
          <li className="flex justify-between py-2 font-semibold">
            <span>Voor doelen en buffer</span>
            <span className="mono">{e(o.voorDoelen)}</span>
          </li>
        </ul>

        <div className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
          {!bewerkInkomen ? (
            <>
              <p>
                {handmatig
                  ? "Dit inkomen heb je zelf ingevuld."
                  : inkomenAuto
                    ? `Dit inkomen komt uit je boekhouding: je winst doorgerekend naar een jaar, minus de belasting die je moet reserveren (${autoUitleg}).${inkomenAuto.betrouwbaar ? "" : " Er is nog weinig van het jaar voorbij, dus dit is nog een grove schatting."}`
                    : autoUitleg}
              </p>
              <button type="button" onClick={() => setBewerkInkomen(true)} className="mt-1 inline-flex min-h-11 items-center text-[12.5px] font-medium text-ink underline">
                {handmatig ? "Aanpassen" : "Zelf invullen"}
              </button>
              {handmatig && inkomenAuto && (
                <button type="button" onClick={() => slaInstellingenOp(null, mes)} disabled={bezig} className="ml-3 inline-flex min-h-11 items-center text-[12.5px] text-muted underline">
                  Terug naar automatisch
                </button>
              )}
            </>
          ) : (
            <div>
              <label className="mb-1 block text-[12px] font-medium">Jouw netto inkomen per maand (€)</label>
              <DecimalInput value={eigen} onValueChange={setEigen} />
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  onClick={async () => {
                    if (await slaInstellingenOp(eigen > 0 ? eigen : null, mes)) setBewerkInkomen(false);
                  }}
                  loading={bezig}
                >
                  Opslaan
                </Button>
                <Button type="button" variant="ghost" onClick={() => setBewerkInkomen(false)} disabled={bezig}>
                  Annuleren
                </Button>
              </div>
            </div>
          )}
          <Melding tekst={fout} />
        </div>
      </Card>

      <PostenSectie soort="vaste_last" posten={posten} vandaag={vandaag} />

      <div>
        <PostenSectie soort="schuld" posten={posten} vandaag={vandaag} />
        {schulden.totaalRestschuld > 0 && (
          <Card className="mt-3 p-4 text-[12.5px] leading-relaxed">
            <p>
              Totaal nog af te lossen: <strong>{e(schulden.totaalRestschuld)}</strong>.{" "}
              {schulden.schuldenvrijOp ? (
                <>
                  Op dit tempo ben je schuldenvrij in <strong>{korteMaand(schulden.schuldenvrijOp)}</strong>, met ongeveer {e(schulden.totaleRente)} aan rente.
                </>
              ) : schulden.teLaag.length > 0 ? (
                <>Voor {schulden.teLaag.join(", ")} los je met het huidige maandbedrag niets af; pas het bedrag aan.</>
              ) : (
                "Vul bij elke schuld een maandbedrag in om te zien wanneer je klaar bent."
              )}
            </p>
            {schulden.extraAflossenEerst && <p className="mt-2 text-muted">Heb je extra ruimte? Los dan eerst extra af op {schulden.extraAflossenEerst}: dat is de schuld met de hoogste rente, en bespaart dus het meeste.</p>}
          </Card>
        )}
      </div>

      <PostenSectie soort="speelruimte" posten={posten} vandaag={vandaag} />
      <SpeelruimteSectie posten={posten} uitgaven={uitgaven} vandaag={vandaag} />
      <DoelenSectie doelen={doelen} voorDoelen={o.voorDoelen} vandaag={vandaag} />

      <Card className="p-5">
        <h2 className="display mb-2 flex items-center gap-2 text-[15px] font-semibold">
          <Lock size={15} /> Privacy
        </h2>
        <p className="text-[12.5px] leading-relaxed text-muted">Alles op deze pagina is alleen voor jou zichtbaar. Het zit niet in je jaaroverzicht of exports en wordt nergens anders in de app getoond.</p>
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={mes}
            disabled={bezig}
            onChange={async (ev) => {
              const nieuw = ev.target.checked;
              setMes(nieuw);
              if (!(await slaInstellingenOp(instellingen.inkomen_override_maand, nieuw))) setMes(!nieuw);
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-[#211F1C]"
          />
          <span>
            Mes (de chat) mag deze gegevens gebruiken
            <span className="block text-[11.5px] text-muted">Dan kan Mes advies geven met je echte vaste lasten, schulden en doelen. Aan: die gegevens gaan bij je vragen naar de AI. Uit (standaard): Mes ziet niets hiervan.</span>
          </span>
        </label>
      </Card>

      <p className="text-[11.5px] leading-relaxed text-muted">Dit is een rekenhulp voor je eigen overzicht, geen financieel of beleggingsadvies.</p>
    </div>
  );
}
