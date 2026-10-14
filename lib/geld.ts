// Rekenkern van Money mode: wat houd je over, wanneer ben je schuldenvrij en is je doel haalbaar. Bewust zonder
// app-imports, zodat alles los te testen is. Bedragen worden in hele centen opgeteld.

export type PostSoort = "vaste_last" | "schuld" | "speelruimte";

export interface GeldPost {
  id: string;
  soort: PostSoort;
  naam: string;
  bedrag_maand: number;
  restschuld: number | null;
  rente_percentage: number | null;
  einddatum: string | null;
}

export interface GeldDoel {
  id: string;
  naam: string;
  soort: "sparen" | "beleggen" | "overzicht";
  doel_bedrag: number | null;
  huidig_bedrag: number;
  streefdatum: string | null;
}

export interface GeldUitgave {
  id?: string;
  post_id: string;
  datum: string;
  bedrag: number;
}

const naarCent = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
const naarEuro = (c: number) => c / 100;
const som = (xs: number[]) => naarEuro(xs.reduce((a, x) => a + naarCent(x), 0));

// ---------- datum-hulp (alles in YYYY-MM-DD) ----------

export function maandenTussen(van: string, tot: string): number {
  const [j1, m1, d1] = van.split("-").map(Number);
  const [j2, m2, d2] = tot.split("-").map(Number);
  let m = (j2 - j1) * 12 + (m2 - m1);
  if (d2 < d1) m -= 1; // een maand telt pas vol als de dag is bereikt
  return m;
}

export function plusMaanden(datum: string, maanden: number): string {
  const [j, m, d] = datum.split("-").map(Number);
  const totaal = (m - 1) + maanden;
  const jaar = j + Math.floor(totaal / 12);
  const maand = ((totaal % 12) + 12) % 12;
  const laatste = new Date(Date.UTC(jaar, maand + 1, 0)).getUTCDate();
  return `${jaar}-${String(maand + 1).padStart(2, "0")}-${String(Math.min(d, laatste)).padStart(2, "0")}`;
}

// ---------- inkomen en maandoverzicht ----------

export interface InkomenAuto {
  perMaand: number;
  // Te weinig van het jaar voorbij voor een betrouwbaar gemiddelde
  betrouwbaar: boolean;
  winstJaar: number;
  belastingJaar: number;
}

// Je netto inkomen per maand uit je boekhouding: de winst doorgerekend naar een heel jaar, min de belasting
// (inkomstenbelasting + Zvw) die je daarover moet reserveren, gedeeld door 12. BTW zit niet in de winst en is dus al buiten beschouwing.
export function inkomenUitBoekhouding(winstTotNu: number, dagenVoorbij: number, belastingOverWinst: (winstJaar: number) => number): InkomenAuto {
  const dagen = Math.max(1, dagenVoorbij);
  const winstJaar = Math.max(0, (winstTotNu / dagen) * 365);
  const belastingJaar = Math.max(0, belastingOverWinst(winstJaar));
  return { perMaand: naarEuro(Math.round(((winstJaar - belastingJaar) / 12) * 100)), betrouwbaar: dagenVoorbij >= 45, winstJaar, belastingJaar };
}

export interface MaandOverzicht {
  inkomen: number;
  vasteLasten: number;
  aflossingen: number;
  speelruimte: number;
  // Wat er overblijft nadat vaste lasten en aflossingen zijn betaald
  naVastEnAflossing: number;
  // Wat er overblijft voor doelen, sparen of een buffer, ná je speelruimte
  voorDoelen: number;
}

export function maandOverzicht(inkomen: number, posten: GeldPost[]): MaandOverzicht {
  const vasteLasten = som(posten.filter((p) => p.soort === "vaste_last").map((p) => p.bedrag_maand));
  const aflossingen = som(posten.filter((p) => p.soort === "schuld").map((p) => p.bedrag_maand));
  const speelruimte = som(posten.filter((p) => p.soort === "speelruimte").map((p) => p.bedrag_maand));
  const naVast = naarEuro(naarCent(inkomen) - naarCent(vasteLasten) - naarCent(aflossingen));
  return { inkomen: naarEuro(naarCent(inkomen)), vasteLasten, aflossingen, speelruimte, naVastEnAflossing: naVast, voorDoelen: naarEuro(naarCent(naVast) - naarCent(speelruimte)) };
}

// ---------- schulden ----------

export interface AflossingPlan {
  // null = niet af te lossen met dit maandbedrag (de rente is hoger dan de aflossing) of geen gegevens
  maanden: number | null;
  totaleRente: number | null;
  klaarOp: string | null;
  reden: "ok" | "geen_gegevens" | "te_laag";
}

export function aflossingPlan(post: Pick<GeldPost, "restschuld" | "bedrag_maand" | "rente_percentage">, vandaag: string): AflossingPlan {
  const schuld = post.restschuld ?? 0;
  if (!(schuld > 0)) return { maanden: 0, totaleRente: 0, klaarOp: vandaag, reden: "ok" };
  if (!(post.bedrag_maand > 0)) return { maanden: null, totaleRente: null, klaarOp: null, reden: "geen_gegevens" };

  const r = (post.rente_percentage ?? 0) / 100 / 12;
  let maanden: number;
  if (r === 0) {
    maanden = Math.ceil(schuld / post.bedrag_maand);
  } else {
    if (post.bedrag_maand <= schuld * r) return { maanden: null, totaleRente: null, klaarOp: null, reden: "te_laag" };
    maanden = Math.ceil(-Math.log(1 - (r * schuld) / post.bedrag_maand) / Math.log(1 + r));
  }
  // De laatste betaling is vaak lager dan het maandbedrag: simuleer voor de exacte rente.
  let rest = schuld;
  let rente = 0;
  for (let i = 0; i < maanden && rest > 0.005; i++) {
    const maandRente = rest * r;
    rente += maandRente;
    rest = rest + maandRente - post.bedrag_maand;
  }
  return { maanden, totaleRente: Math.round(rente * 100) / 100, klaarOp: plusMaanden(vandaag, maanden), reden: "ok" };
}

export interface SchuldenSamenvatting {
  totaalRestschuld: number;
  schuldenvrijOp: string | null;
  totaleRente: number;
  // Schulden waarvan niets aflossen mogelijk is met het huidige maandbedrag
  teLaag: string[];
  // Volgorde om extra af te lossen: hoogste rente eerst bespaart de meeste rente
  extraAflossenEerst: string | null;
}

export function schuldenSamenvatting(posten: GeldPost[], vandaag: string): SchuldenSamenvatting {
  const schulden = posten.filter((p) => p.soort === "schuld" && (p.restschuld ?? 0) > 0);
  const plannen = schulden.map((p) => ({ p, plan: aflossingPlan(p, vandaag) }));
  const klaar = plannen.map((x) => x.plan.klaarOp).filter((d): d is string => !!d);
  const metRente = schulden.filter((p) => (p.rente_percentage ?? 0) > 0).sort((a, b) => (b.rente_percentage ?? 0) - (a.rente_percentage ?? 0));
  return {
    totaalRestschuld: som(schulden.map((p) => p.restschuld ?? 0)),
    schuldenvrijOp: plannen.some((x) => x.plan.klaarOp == null) ? null : klaar.length ? klaar.sort().at(-1) ?? null : null,
    totaleRente: som(plannen.map((x) => x.plan.totaleRente ?? 0)),
    teLaag: plannen.filter((x) => x.plan.reden === "te_laag").map((x) => x.p.naam),
    extraAflossenEerst: schulden.length > 1 && metRente.length > 0 ? metRente[0].naam : null,
  };
}

// ---------- speelruimte (casino, uit eten, drankjes, ...) ----------

export interface SpeelruimteStand {
  post: GeldPost;
  budget: number;
  gebruikt: number;
  over: number; // negatief als je erboven zit
  procent: number;
}

export function speelruimteStand(posten: GeldPost[], uitgaven: GeldUitgave[], maand: string): SpeelruimteStand[] {
  return posten
    .filter((p) => p.soort === "speelruimte")
    .map((post) => {
      const gebruikt = som(uitgaven.filter((u) => u.post_id === post.id && u.datum.startsWith(maand)).map((u) => u.bedrag));
      const budget = post.bedrag_maand;
      return { post, budget, gebruikt, over: naarEuro(naarCent(budget) - naarCent(gebruikt)), procent: budget > 0 ? Math.round((gebruikt / budget) * 100) : gebruikt > 0 ? 100 : 0 };
    });
}

function maandVoor(maand: string, aantal: number): string {
  return plusMaanden(`${maand}-01`, -aantal).slice(0, 7);
}

// Zit je al een paar maanden achter elkaar boven je ruimte? Alleen dan melden we het: één uitschieter is geen patroon.
export function structureelBoven(uitgaven: GeldUitgave[], post: GeldPost, totEnMetMaand: string, maanden = 3): boolean {
  if (!(post.bedrag_maand > 0) && !uitgaven.some((u) => u.post_id === post.id)) return false;
  for (let i = 0; i < maanden; i++) {
    const m = maandVoor(totEnMetMaand, i);
    const gebruikt = som(uitgaven.filter((u) => u.post_id === post.id && u.datum.startsWith(m)).map((u) => u.bedrag));
    if (!(gebruikt > post.bedrag_maand)) return false;
  }
  return true;
}

// ---------- doelen ----------

export type DoelStatus = "gehaald" | "haalbaar" | "krap" | "niet_haalbaar" | "geen_ruimte" | "overzicht" | "geen_datum";

export interface DoelPlan {
  doel: GeldDoel;
  resterend: number;
  procent: number;
  maandenTotDatum: number | null;
  nodigPerMaand: number | null;
  status: DoelStatus;
  // Bij een doel dat niet past: wanneer haal je het wel, met wat er voor dit doel overblijft
  haalbaarOp: string | null;
  maandenBijRuimte: number | null;
}

// Verdeelt je vrije ruimte over de doelen: eerst die met de dichtstbijzijnde streefdatum, dan die zonder datum.
export function doelPlannen(doelen: GeldDoel[], voorDoelen: number, vandaag: string): DoelPlan[] {
  const beschikbaar = Math.max(0, voorDoelen);
  const metBedrag = doelen.filter((d) => d.soort !== "overzicht");
  const gesorteerd = [...metBedrag].sort((a, b) => {
    if (a.streefdatum && b.streefdatum) return a.streefdatum < b.streefdatum ? -1 : a.streefdatum > b.streefdatum ? 1 : 0;
    if (a.streefdatum) return -1;
    if (b.streefdatum) return 1;
    return 0;
  });

  let verbruiktCent = 0;
  const per = new Map<string, DoelPlan>();
  for (const d of gesorteerd) {
    const doel = d.doel_bedrag ?? 0;
    const resterend = Math.max(0, naarEuro(naarCent(doel) - naarCent(d.huidig_bedrag)));
    const procent = doel > 0 ? Math.min(100, Math.round((d.huidig_bedrag / doel) * 100)) : 0;
    const basis = { doel: d, resterend, procent };

    if (doel > 0 && resterend === 0) {
      per.set(d.id, { ...basis, maandenTotDatum: null, nodigPerMaand: 0, status: "gehaald", haalbaarOp: null, maandenBijRuimte: null });
      continue;
    }
    const overCent = Math.max(0, naarCent(beschikbaar) - verbruiktCent);

    if (d.streefdatum) {
      const maanden = Math.max(0, maandenTussen(vandaag, d.streefdatum));
      if (maanden === 0) {
        per.set(d.id, { ...basis, maandenTotDatum: 0, nodigPerMaand: resterend, status: "niet_haalbaar", haalbaarOp: overCent > 0 ? plusMaanden(vandaag, Math.ceil(naarCent(resterend) / overCent)) : null, maandenBijRuimte: overCent > 0 ? Math.ceil(naarCent(resterend) / overCent) : null });
        continue;
      }
      const nodigCent = Math.ceil(naarCent(resterend) / maanden);
      if (nodigCent <= overCent) {
        verbruiktCent += nodigCent;
        // "krap" als dit doel meer dan 3/4 van wat er over was opeist
        const krap = overCent > 0 && nodigCent / overCent > 0.75;
        per.set(d.id, { ...basis, maandenTotDatum: maanden, nodigPerMaand: naarEuro(nodigCent), status: krap ? "krap" : "haalbaar", haalbaarOp: null, maandenBijRuimte: null });
      } else {
        const m = overCent > 0 ? Math.ceil(naarCent(resterend) / overCent) : null;
        per.set(d.id, { ...basis, maandenTotDatum: maanden, nodigPerMaand: naarEuro(nodigCent), status: overCent > 0 ? "niet_haalbaar" : "geen_ruimte", haalbaarOp: m != null ? plusMaanden(vandaag, m) : null, maandenBijRuimte: m });
      }
    } else {
      // Zonder streefdatum: wanneer haal je het met alles wat er na de doelen met een datum overblijft?
      if (overCent <= 0) {
        per.set(d.id, { ...basis, maandenTotDatum: null, nodigPerMaand: null, status: "geen_ruimte", haalbaarOp: null, maandenBijRuimte: null });
      } else {
        const m = Math.ceil(naarCent(resterend) / overCent);
        per.set(d.id, { ...basis, maandenTotDatum: null, nodigPerMaand: null, status: "geen_datum", haalbaarOp: plusMaanden(vandaag, m), maandenBijRuimte: m });
      }
    }
  }
  // Doelen zonder bedrag ("overzicht") hebben geen berekening
  return doelen.map((d) => per.get(d.id) ?? { doel: d, resterend: 0, procent: 0, maandenTotDatum: null, nodigPerMaand: null, status: "overzicht" as DoelStatus, haalbaarOp: null, maandenBijRuimte: null });
}
