// Alle BTW-rekenkunde op één plek. Bewust zonder imports, zodat het los te testen is.
//
// Regels: bedragen worden altijd in hele centen berekend en opgeteld. Per BTW-regel geldt:
//   excl = afronden(incl / (1 + percentage/100));  btw = incl - excl
// Daardoor is excl + btw ALTIJD exact gelijk aan incl, en kunnen totalen nooit een cent afwijken van de
// som van de regels (de oorzaak van "kleine verschillen in de boekhouding").

export const BTW_TARIEVEN = [21, 9, 0] as const;

export interface BtwRegel {
  percentage: number;
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
}

export function naarCenten(euro: number): number {
  // toPrecision voorkomt drijvende-komma-fouten zoals 1.005 * 100 = 100.49999999999999
  return Math.round(Number((euro * 100).toPrecision(12)));
}

export const naarEuro = (centen: number) => centen / 100;

export function splitInclBtw(inclEuro: number, percentage: number): { excl: number; btw: number } {
  const incl = naarCenten(inclEuro);
  const excl = Math.round(incl / (1 + percentage / 100));
  return { excl: naarEuro(excl), btw: naarEuro(incl - excl) };
}

// Voor één BTW-tarief over het hele document (de gewone situatie).
export function berekenExclBtw(totaalInclBtw: number, btwPercentage: number) {
  const { excl, btw } = splitInclBtw(totaalInclBtw, btwPercentage);
  return { bedragExclBtw: excl, btwBedrag: btw };
}

export function maakRegel(percentage: number, inclEuro: number): BtwRegel {
  const { excl, btw } = splitInclBtw(inclEuro, percentage);
  return { percentage, bedrag_incl_btw: naarEuro(naarCenten(inclEuro)), bedrag_excl_btw: excl, btw_bedrag: btw };
}

// Regels met hetzelfde percentage samenvoegen en lege regels weglaten; hoogste tarief eerst.
export function normaliseerRegels(regels: { percentage: number; bedrag_incl_btw: number }[]): BtwRegel[] {
  const perTarief = new Map<number, number>();
  for (const r of regels) {
    const centen = naarCenten(r.bedrag_incl_btw);
    if (!Number.isFinite(centen) || centen <= 0) continue;
    perTarief.set(r.percentage, (perTarief.get(r.percentage) ?? 0) + centen);
  }
  return [...perTarief.entries()].sort((a, b) => b[0] - a[0]).map(([p, centen]) => maakRegel(p, naarEuro(centen)));
}

export function totalenVanRegels(regels: BtwRegel[]) {
  let incl = 0;
  let excl = 0;
  let btw = 0;
  for (const r of regels) {
    incl += naarCenten(r.bedrag_incl_btw);
    excl += naarCenten(r.bedrag_excl_btw);
    btw += naarCenten(r.btw_bedrag);
  }
  return { incl: naarEuro(incl), excl: naarEuro(excl), btw: naarEuro(btw) };
}

export const isGemengd = (regels: BtwRegel[] | null | undefined): regels is BtwRegel[] =>
  Array.isArray(regels) && regels.length >= 2;

// Het "gewone" percentage voor een transactie met meerdere tarieven: dat van de grootste regel.
export function hoofdPercentage(regels: BtwRegel[]): number {
  return [...regels].sort((a, b) => b.bedrag_incl_btw - a.bedrag_incl_btw)[0]?.percentage ?? 21;
}

// Eén uniforme blik op een transactie: altijd een lijst regels, ook bij één tarief.
export function regelsVanTransactie(t: {
  btw_regels?: BtwRegel[] | null;
  btw_percentage: number;
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
}): BtwRegel[] {
  if (isGemengd(t.btw_regels)) return t.btw_regels;
  return [
    {
      percentage: Number(t.btw_percentage),
      bedrag_incl_btw: Number(t.bedrag_incl_btw),
      bedrag_excl_btw: Number(t.bedrag_excl_btw),
      btw_bedrag: Number(t.btw_bedrag),
    },
  ];
}

// BTW op eten en drinken in de horeca (consumpties) kun je als ondernemer NIET terugvragen als voorbelasting
// (art. 15 lid 4 Wet OB), ook niet bij een zakelijk etentje met een klant. In de app staan zulke bonnen in de
// categorie "Horeca/representatie". Die BTW telt daarom niet mee als voorbelasting — zowel op het dashboard als
// in de BTW-modus, via déze ene functie, zodat die twee nooit uit elkaar lopen.
export const NIET_AFTREKBARE_BTW_CATEGORIEEN = ["Horeca/representatie"];

export const isVoorbelastingAftrekbaar = (t: { categorie: string }) =>
  !NIET_AFTREKBARE_BTW_CATEGORIEEN.includes(t.categorie);

// Controle van regels die van een document zijn gelezen: tellen de regels op tot het totaal, en klopt de
// BTW per regel met het percentage? Geeft leesbare meldingen terug (leeg = alles klopt).
export function controleerDocumentRegels(
  regels: { percentage: number; bedrag_incl_btw: number; bedrag_excl_btw?: number | null; btw_bedrag?: number | null }[],
  totaalIncl: number | null
): string[] {
  const meldingen: string[] = [];
  const som = regels.reduce((a, r) => a + naarCenten(r.bedrag_incl_btw), 0);
  if (totaalIncl != null && Math.abs(som - naarCenten(totaalIncl)) > 2) {
    meldingen.push(
      `De BTW-regels tellen op tot ${naarEuro(som).toFixed(2).replace(".", ",")} maar het totaal op het document is ${totaalIncl.toFixed(2).replace(".", ",")}.`
    );
  }
  for (const r of regels) {
    if (r.btw_bedrag != null) {
      const verwacht = splitInclBtw(r.bedrag_incl_btw, r.percentage).btw;
      if (Math.abs(verwacht - r.btw_bedrag) > 0.03) {
        meldingen.push(`Bij ${r.percentage}% staat ${r.btw_bedrag.toFixed(2).replace(".", ",")} BTW, maar over dat bedrag zou ${verwacht.toFixed(2).replace(".", ",")} kloppen.`);
      }
    }
  }
  return meldingen;
}
