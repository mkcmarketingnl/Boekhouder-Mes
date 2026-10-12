import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, CLAUDE_MODEL_EXTRACT, CLAUDE_MODEL_ARBITER } from "@/lib/anthropic/client";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  TRANSCRIPTIE_SYSTEM_PROMPT,
  parseClaudeJson,
} from "@/lib/anthropic/prompts";
import { formatCurrency } from "@/lib/format";
import type { ExtractedInvoiceData, TransactieType } from "@/lib/types";

// Elke fout in een gescande factuur belandt in de boekhouding van de gebruiker. Daarom wordt elk
// document hier meerdere keren en onafhankelijk gelezen en wordt het resultaat in code gecontroleerd:
//   1. Lezing A  — volledige extractie (Sonnet 5.5): naam, bedragen, datum, type, categorie, risico.
//   2. Lezing B  — onafhankelijke "letterlijk overschrijven"-ronde (Sonnet 5.5, andere prompt), parallel.
//   3. Verschillen tussen A en B? Dan beslist een derde lezing (Opus 5.5) per veld bij meerderheid.
//   4. Harde controles in code (optellen, datum, ontbrekende velden).
// Alleen als alles overeenkomt is de status "akkoord" — alleen dan mag de app automatisch opslaan.

type Bestand = Anthropic.Messages.ContentBlockParam;

interface Transcriptie {
  afzender_naam: string | null;
  geadresseerde_naam: string | null;
  factuurnummer: string | null;
  factuurdatum: string | null;
  totaal_incl_btw: number | null;
  totaal_excl_btw: number | null;
  btw_bedrag: number | null;
  btw_percentage: number | null;
}

type Bron = "scan 1" | "scan 2" | "controlescan";

interface Lezing<T> {
  bron: Bron;
  waarde: T | null;
}

// ---------- vergelijkhelpers ----------

const RECHTSVORM_TOKENS = new Set(["bv", "nv", "vof", "cv", "sarl", "gmbh", "ltd", "llc", "inc", "eenmanszaak", "stichting"]);

function naamTokens(s: string | null): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, " en ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !RECHTSVORM_TOKENS.has(t));
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// Strikt: dezelfde naam, op hoofdletters, leestekens, spaties en rechtsvorm na. Spelfouten tellen
// bewust als VERSCHIL — juist die willen we door een derde lezing laten beslechten.
export function zelfdeNaam(a: string | null, b: string | null): boolean {
  const x = naamTokens(a);
  const y = naamTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  if (x.join("") === y.join("")) return true;
  const [kort, lang] = x.length <= y.length ? [x, y] : [y, x];
  return kort.join("").length >= 5 && kort.every((t, i) => lang[i] === t);
}

// Soepel: om te bepalen of een naam op het document "mijn bedrijf" is (handelsnaam wijkt vaak licht af).
export function lijktOpEigenBedrijf(eigen: string, naam: string | null): boolean {
  const x = naamTokens(eigen).join("");
  const y = naamTokens(naam).join("");
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))) return true;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length) >= 0.8;
}

const zelfdeBedrag = (a: number, b: number) => Math.abs(a - b) < 0.011;
const zelfdeTekst = (a: string, b: string) => a === b;
const zelfdeNummer = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
const zelfdePercentage = (a: number, b: number) => Math.abs(a - b) < 0.5;

function typeUitTranscriptie(t: Transcriptie, eigen: string): TransactieType | null {
  const afzender = lijktOpEigenBedrijf(eigen, t.afzender_naam);
  const geadresseerde = lijktOpEigenBedrijf(eigen, t.geadresseerde_naam);
  if (afzender && !geadresseerde) return "omzet";
  if (geadresseerde && !afzender) return "kosten";
  return null; // geen oordeel (bijv. kassabon of bedrijfsnaam niet herkenbaar)
}

// ---------- stemmen per veld ----------

interface Stem<T> {
  gekozen: T | null;
  unaniem: boolean;
  lezingen: Lezing<T>[];
}

const VOORKEUR: Bron[] = ["controlescan", "scan 1", "scan 2"];

export function stem<T>(lezingen: Lezing<T>[], gelijk: (a: T, b: T) => boolean, nullIsAfwezig = false): Stem<T> {
  const aanwezig = lezingen.filter((l): l is Lezing<T> & { waarde: T } => l.waarde !== null);
  if (aanwezig.length === 0) return { gekozen: null, unaniem: true, lezingen };

  const clusters: (Lezing<T> & { waarde: T })[][] = [];
  for (const l of aanwezig) {
    const cluster = clusters.find((c) => gelijk(c[0].waarde, l.waarde));
    if (cluster) cluster.push(l);
    else clusters.push([l]);
  }

  const maxGrootte = Math.max(...clusters.map((c) => c.length));
  const grootste = clusters.filter((c) => c.length === maxGrootte);
  // bij gelijkspel: het cluster met de lezing van het sterkste model
  const winnaar =
    grootste.find((c) => c.some((l) => l.bron === "controlescan")) ?? grootste.find((c) => c.some((l) => l.bron === "scan 1")) ?? grootste[0];
  const vertegenwoordiger = [...winnaar].sort((x, y) => VOORKEUR.indexOf(x.bron) - VOORKEUR.indexOf(y.bron))[0];

  const ontbrekend = !nullIsAfwezig && aanwezig.length < lezingen.length;
  return { gekozen: vertegenwoordiger.waarde, unaniem: clusters.length === 1 && !ontbrekend, lezingen };
}

function toon<T>(s: Stem<T>, fmt: (v: T) => string): string {
  return s.lezingen.map((l) => `${l.bron}: ${l.waarde === null ? "niet gelezen" : fmt(l.waarde)}`).join(" · ");
}

// ---------- AI-aanroepen ----------

async function leesJson<T>(model: string, system: string, bestand: Bestand, vraag: string): Promise<T | null> {
  try {
    const anthropic = getAnthropicClient();
    // Sonnet/Opus 5.5 "denken" standaard even na (kost denk-tokens van dezelfde limiet) — ruim genoeg
    // houden, anders wordt het JSON-antwoord afgekapt.
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: [bestand, { type: "text", text: vraag }] }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    return parseClaudeJson<T>(textBlock.text);
  } catch (err) {
    console.error(`Scan-aanroep mislukt (${model}):`, err);
    return null;
  }
}

const TRANSCRIPTIE_VRAAG = "Lees dit document en geef de JSON.";

export function nietGeverifieerd(reden: string): ExtractedInvoiceData {
  return {
    leverancier: null,
    factuurnummer: null,
    factuurdatum: null,
    bedrag_incl_btw: null,
    bedrag_excl_btw: null,
    btw_bedrag: null,
    btw_percentage: null,
    omschrijving: null,
    voorgestelde_categorie: null,
    type: null,
    type_onzeker: true,
    leesbaarheid: "slecht",
    risico: "midden",
    risico_toelichting: "Automatische verwerking is mislukt. Vul de gegevens handmatig in.",
    controle_status: "niet_geverifieerd",
    controle_afwijkingen: [reden],
  };
}

// ---------- analyse ----------

interface Analyse {
  type: Stem<TransactieType>;
  naam: Stem<string>;
  bedrag: Stem<number>;
  datum: Stem<string>;
  nummer: Stem<string>;
  btwPercentage: Stem<number>;
}

export function analyseer(a: ExtractedInvoiceData, tr: { bron: Bron; t: Transcriptie | null }[], eigen: string): Analyse {
  const typeStem = stem<TransactieType>(
    [
      { bron: "scan 1", waarde: a.type },
      ...tr.map(({ bron, t }) => ({ bron, waarde: t ? typeUitTranscriptie(t, eigen) : null })),
    ],
    zelfdeTekst,
    true // "geen oordeel" is geen tegenspraak
  );
  const type = typeStem.gekozen ?? a.type ?? "kosten";

  const tegenpartij = (t: Transcriptie) => (type === "omzet" ? t.geadresseerde_naam : t.afzender_naam);

  return {
    type: typeStem,
    naam: stem<string>(
      [{ bron: "scan 1", waarde: a.leverancier?.trim() || null }, ...tr.map(({ bron, t }) => ({ bron, waarde: t ? tegenpartij(t)?.trim() || null : null }))],
      zelfdeNaam
    ),
    bedrag: stem<number>(
      [{ bron: "scan 1", waarde: a.bedrag_incl_btw }, ...tr.map(({ bron, t }) => ({ bron, waarde: t?.totaal_incl_btw ?? null }))],
      zelfdeBedrag
    ),
    datum: stem<string>(
      [{ bron: "scan 1", waarde: a.factuurdatum }, ...tr.map(({ bron, t }) => ({ bron, waarde: t?.factuurdatum ?? null }))],
      zelfdeTekst
    ),
    // een factuurnummer dat maar één scan zag, is geen tegenspraak (veel bonnen hebben er geen)
    nummer: stem<string>(
      [{ bron: "scan 1", waarde: a.factuurnummer }, ...tr.map(({ bron, t }) => ({ bron, waarde: t?.factuurnummer ?? null }))],
      zelfdeNummer,
      true
    ),
    // bij meerdere BTW-tarieven op één bon geeft scan 2 bewust null — dat is geen tegenspraak
    btwPercentage: stem<number>(
      [{ bron: "scan 1", waarde: a.btw_percentage }, ...tr.map(({ bron, t }) => ({ bron, waarde: t?.btw_percentage ?? null }))],
      zelfdePercentage,
      true
    ),
  };
}

export const heeftVerschil = (x: Analyse) =>
  !x.type.unaniem || !x.naam.unaniem || !x.bedrag.unaniem || !x.datum.unaniem || !x.nummer.unaniem || !x.btwPercentage.unaniem;

// ---------- hoofdfunctie ----------

export async function scanDocument(params: {
  bestand: Bestand;
  eigenBedrijfsnaam: string;
  activiteiten: string;
}): Promise<ExtractedInvoiceData> {
  const { bestand, eigenBedrijfsnaam, activiteiten } = params;
  const extractieSysteem = buildExtractionSystemPrompt(eigenBedrijfsnaam, activiteiten);

  const [aRuw, bRuw] = await Promise.all([
    leesJson<ExtractedInvoiceData>(CLAUDE_MODEL_EXTRACT, extractieSysteem, bestand, buildExtractionUserPrompt()),
    leesJson<Transcriptie>(CLAUDE_MODEL_EXTRACT, TRANSCRIPTIE_SYSTEM_PROMPT, bestand, TRANSCRIPTIE_VRAAG),
  ]);

  // Lukte de hoofdlezing niet, probeer het eenmalig met het sterkste model.
  const a = aRuw ?? (await leesJson<ExtractedInvoiceData>(CLAUDE_MODEL_ARBITER, extractieSysteem, bestand, buildExtractionUserPrompt()));
  if (!a) return nietGeverifieerd("De scan is niet gelukt.");

  let transcripties: { bron: Bron; t: Transcriptie | null }[] = [{ bron: "scan 2", t: bRuw }];
  let analyse = analyseer(a, transcripties, eigenBedrijfsnaam);

  let arbiterGedraaid = false;
  if (!bRuw || heeftVerschil(analyse)) {
    const cRuw = await leesJson<Transcriptie>(CLAUDE_MODEL_ARBITER, TRANSCRIPTIE_SYSTEM_PROMPT, bestand, TRANSCRIPTIE_VRAAG);
    arbiterGedraaid = true;
    transcripties = [...transcripties, { bron: "controlescan", t: cRuw }];
    analyse = analyseer(a, transcripties, eigenBedrijfsnaam);
  }

  const afwijkingen: string[] = [];
  const geverifieerd = transcripties.some((x) => x.t !== null);

  if (!geverifieerd) {
    afwijkingen.push("De controle-scan is niet gelukt, dus dit document is maar één keer gelezen.");
  }

  // Alleen verschillen tussen lezingen melden die er echt zijn (een ontbrekende controle is hierboven al gemeld).
  function verschil<T>(label: string, s: Stem<T>, fmt: (v: T) => string) {
    if (s.unaniem || !geverifieerd) return;
    const gekozen = s.gekozen !== null ? fmt(s.gekozen) : "niets";
    afwijkingen.push(
      `${label}: de scans lazen niet hetzelfde (${toon(s, fmt)}). We hebben ${gekozen} ingevuld${arbiterGedraaid ? " (op basis van een extra controle-scan)" : ""} — vergelijk dit met je document.`
    );
  }
  verschil("Naam", analyse.naam, (v) => `"${v}"`);
  verschil("Totaalbedrag", analyse.bedrag, formatCurrency);
  verschil("Datum", analyse.datum, (v) => v);
  verschil("Factuurnummer", analyse.nummer, (v) => v);
  verschil("BTW-percentage", analyse.btwPercentage, (v) => `${v}%`);
  verschil("Soort (kosten/omzet)", analyse.type, (v) => v);

  const final: ExtractedInvoiceData = {
    ...a,
    leverancier: analyse.naam.gekozen ?? a.leverancier,
    factuurnummer: analyse.nummer.gekozen ?? a.factuurnummer,
    factuurdatum: analyse.datum.gekozen ?? a.factuurdatum,
    bedrag_incl_btw: analyse.bedrag.gekozen ?? a.bedrag_incl_btw,
    btw_percentage: analyse.btwPercentage.gekozen ?? a.btw_percentage,
    type: analyse.type.gekozen ?? a.type,
    type_onzeker: a.type_onzeker || !analyse.type.unaniem,
  };

  // ---------- harde controles in code (los van de AI) ----------
  if (!final.leverancier?.trim()) afwijkingen.push("Er is geen naam gevonden op het document.");
  if (final.bedrag_incl_btw === null || final.bedrag_incl_btw <= 0) afwijkingen.push("Er is geen (geldig) totaalbedrag gevonden.");
  if (!final.factuurdatum) afwijkingen.push("Er is geen datum gevonden op het document.");

  if (final.factuurdatum) {
    const datum = new Date(`${final.factuurdatum}T00:00:00Z`);
    const nu = new Date();
    if (Number.isNaN(datum.getTime())) {
      afwijkingen.push(`De gelezen datum (${final.factuurdatum}) is geen geldige datum.`);
    } else {
      if (datum.getUTCFullYear() !== nu.getUTCFullYear()) {
        afwijkingen.push(`De datum (${final.factuurdatum}) valt niet in dit jaar — klopt het jaartal? Een verkeerd jaartal laat de factuur uit je jaaroverzicht verdwijnen.`);
      }
      if (datum.getTime() > nu.getTime() + 2 * 86_400_000) {
        afwijkingen.push(`De datum (${final.factuurdatum}) ligt in de toekomst.`);
      }
    }
  }

  // optellen: excl. + btw moet het totaal opleveren (op de scan van beide lezingen)
  const somKlopt = (excl: number | null | undefined, btw: number | null | undefined, incl: number | null | undefined) =>
    excl == null || btw == null || incl == null || Math.abs(excl + btw - incl) <= 0.03;
  const trB = transcripties[0]?.t;
  if (!somKlopt(a.bedrag_excl_btw, a.btw_bedrag, a.bedrag_incl_btw) || (trB && !somKlopt(trB.totaal_excl_btw, trB.btw_bedrag, trB.totaal_incl_btw))) {
    afwijkingen.push("De bedragen op de scan tellen niet op (excl. BTW + BTW ≠ totaal) — controleer het totaalbedrag.");
  }

  // BTW-percentage moet passen bij de bedragen; zo niet, dan staan er waarschijnlijk meerdere tarieven op (of is iets misgelezen)
  if (a.bedrag_excl_btw && a.btw_bedrag != null && final.btw_percentage != null && a.bedrag_excl_btw > 0) {
    const afgeleid = (a.btw_bedrag / a.bedrag_excl_btw) * 100;
    if (Math.abs(afgeleid - final.btw_percentage) > 1.5) {
      afwijkingen.push(`Het BTW-percentage (${final.btw_percentage}%) past niet bij de bedragen op het document (±${afgeleid.toFixed(0)}%). Staan er meerdere BTW-tarieven op? Controleer het percentage — het bepaalt je BTW-saldo.`);
    }
  }

  final.controle_afwijkingen = afwijkingen;
  final.controle_status = !geverifieerd ? "niet_geverifieerd" : afwijkingen.length === 0 ? "akkoord" : "afwijking";
  return final;
}
