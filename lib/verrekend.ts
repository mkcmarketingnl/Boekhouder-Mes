// Verrekende kosten op een verkoopfactuur: bedragen die van het factuurbedrag worden afgehouden voor een dienst die je
// afneemt (factoring, commissie, platformkosten, uitbetaalkosten). Voorbeeld van een echte factuur:
//   Factuurbedrag € 399,30 (omzet: € 330,00 + € 69,30 BTW) → Factoring 4,8%: € 23,20 (€ 19,17 + € 4,03 BTW) → Eindbedrag € 376,10.
// Boekhoudkundig blijft de omzet € 330,00 met € 69,30 BTW (die moet je afdragen over het hele factuurbedrag), en de
// factoring is een aparte kostenpost met € 4,03 voorbelasting. Samen kom je op € 376,10: precies wat je ontving.
// Bewust zonder imports van de app zelf (alleen ./btw), zodat het los te testen is.
import { naarCenten, naarEuro } from "./btw";

export interface RuweVerrekendeKost {
  omschrijving?: string | null;
  partij?: string | null;
  referentie?: string | null;
  bedrag_incl_btw?: number | null;
  bedrag_excl_btw?: number | null;
  btw_bedrag?: number | null;
  btw_percentage?: number | null;
}

export interface VerrekendeKost {
  omschrijving: string;
  // naam van de factoringmaatschappij/het platform als die op het document staat
  partij: string | null;
  // kenmerk, bijv. "YOF-26320374"
  referentie: string | null;
  // alle bedragen positief (de inhouding), in euro's
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  btw_percentage: number;
}

const TARIEVEN = [21, 9, 0];
const geldig = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function snapPercentage(afgeleid: number): number {
  const dichtbij = TARIEVEN.find((t) => Math.abs(t - afgeleid) <= 1.5);
  return dichtbij ?? Math.round(afgeleid * 10) / 10;
}

// Zet een letterlijk gelezen regel om naar een volledige: de AI mag een inhouding negatief lezen (€ -23,20), wij werken
// altijd met positieve bedragen. Ontbreekt er iets, dan rekenen we het uit de rest; kan dat niet, dan is de regel onleesbaar.
export function maakVolledig(ruw: RuweVerrekendeKost[] | null | undefined): { kosten: VerrekendeKost[]; onleesbaar: boolean } {
  const kosten: VerrekendeKost[] = [];
  let onleesbaar = false;
  for (const r of ruw ?? []) {
    let incl = geldig(r.bedrag_incl_btw) ? naarCenten(Math.abs(r.bedrag_incl_btw)) : null;
    let excl = geldig(r.bedrag_excl_btw) ? naarCenten(Math.abs(r.bedrag_excl_btw)) : null;
    let btw = geldig(r.btw_bedrag) ? naarCenten(Math.abs(r.btw_bedrag)) : null;
    let pct = geldig(r.btw_percentage) ? Math.abs(r.btw_percentage) : null;

    if (incl === null && excl !== null && btw !== null) incl = excl + btw;
    if (incl === null && excl !== null && pct !== null) incl = Math.round(excl * (1 + pct / 100));
    if (incl === null || incl <= 0) {
      onleesbaar = true;
      continue;
    }
    if (btw === null && excl !== null) btw = incl - excl;
    if (btw === null && pct !== null) btw = incl - Math.round((incl * 100) / (100 + pct));
    if (btw === null) {
      // zonder enige BTW-aanwijzing: geen BTW aannemen is veiliger dan 21% verzinnen
      btw = 0;
      pct = 0;
    }
    if (excl === null) excl = incl - btw;
    if (pct === null) pct = excl > 0 ? snapPercentage((btw / excl) * 100) : 0;

    kosten.push({
      omschrijving: (r.omschrijving ?? "").trim() || "Verrekende kosten",
      partij: (r.partij ?? "").trim() || null,
      referentie: (r.referentie ?? "").trim() || null,
      bedrag_incl_btw: naarEuro(incl),
      bedrag_excl_btw: naarEuro(excl),
      btw_bedrag: naarEuro(btw),
      btw_percentage: pct,
    });
  }
  return { kosten, onleesbaar };
}

// Vingerafdruk voor het vergelijken van lezingen: "geen", "onleesbaar" of de bedragen in centen, bijv. "2320" of "1000|2320".
export function verrekendSignatuur(ruw: RuweVerrekendeKost[] | null | undefined): string {
  if (!ruw || ruw.length === 0) return "geen";
  const { kosten, onleesbaar } = maakVolledig(ruw);
  if (onleesbaar) return "onleesbaar";
  if (kosten.length === 0) return "geen";
  return kosten
    .map((k) => naarCenten(k.bedrag_incl_btw))
    .sort((a, b) => a - b)
    .join("|");
}

export function zelfdeVerrekendSignatuur(a: string, b: string): boolean {
  if (a === b) return true;
  if (a === "geen" || b === "geen" || a === "onleesbaar" || b === "onleesbaar") return false;
  const x = a.split("|").map(Number);
  const y = b.split("|").map(Number);
  return x.length === y.length && x.every((c, i) => Math.abs(c - y[i]) <= 1);
}

export function totaalVerrekend(kosten: VerrekendeKost[]): number {
  return naarEuro(kosten.reduce((a, k) => a + naarCenten(k.bedrag_incl_btw), 0));
}

// Wat je daadwerkelijk ontvangt: factuurbedrag min de verrekende kosten.
export function nettoNaVerrekening(bedragIncl: number, kosten: VerrekendeKost[]): number {
  return naarEuro(naarCenten(bedragIncl) - naarCenten(totaalVerrekend(kosten)));
}

// Controles in code, los van de AI. Geeft meldingen voor de gebruiker (leeg = alles klopt).
export function controleerVerrekend(
  ruw: RuweVerrekendeKost[] | null | undefined,
  kosten: VerrekendeKost[],
  bedragIncl: number | null,
  eindbedrag: number | null | undefined
): string[] {
  const meldingen: string[] = [];
  for (const r of ruw ?? []) {
    if (geldig(r.bedrag_incl_btw) && geldig(r.bedrag_excl_btw) && geldig(r.btw_bedrag)) {
      if (Math.abs(Math.abs(r.bedrag_excl_btw) + Math.abs(r.btw_bedrag) - Math.abs(r.bedrag_incl_btw)) > 0.03) {
        meldingen.push(`De bedragen van "${(r.omschrijving ?? "verrekende kosten").trim()}" tellen niet op (excl. BTW + BTW ≠ totaal) — controleer ze.`);
      }
    }
  }
  if (kosten.length > 0 && bedragIncl != null && geldig(eindbedrag) && eindbedrag > 0) {
    const verwacht = nettoNaVerrekening(bedragIncl, kosten);
    if (Math.abs(verwacht - eindbedrag) > 0.03) {
      meldingen.push(
        `Het eindbedrag op het document (${fmt(eindbedrag)}) klopt niet met het factuurbedrag min de verrekende kosten (${fmt(bedragIncl)} − ${fmt(totaalVerrekend(kosten))} = ${fmt(verwacht)}). Controleer de bedragen.`
      );
    }
  }
  if (kosten.length > 0 && bedragIncl != null && totaalVerrekend(kosten) >= bedragIncl) {
    meldingen.push("De verrekende kosten zijn net zo hoog als het hele factuurbedrag — controleer of dit klopt.");
  }
  return meldingen;
}

const fmt = (n: number) => "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
