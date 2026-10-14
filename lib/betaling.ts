// Betaalstatus van verkoopfacturen: open, te laat of betaald, en een kant-en-klaar herinneringsbericht.
// Bewust zonder app-imports, zodat het los te testen is. Datums zijn YYYY-MM-DD.

export type BetaalStatus = "betaald" | "open" | "te_laat";

export interface BetaalInfo {
  status: "concept" | "definitief";
  vervaldatum: string;
  betaald_op?: string | null;
  totaal_incl: number;
}

function dagenTussen(van: string, tot: string): number {
  const [j1, m1, d1] = van.split("-").map(Number);
  const [j2, m2, d2] = tot.split("-").map(Number);
  return Math.round((Date.UTC(j2, m2 - 1, d2) - Date.UTC(j1, m1 - 1, d1)) / 86400000);
}

// Een factuur is "te laat" vanaf de dag ná de vervaldatum.
export function betaalStatus(f: BetaalInfo, vandaag: string): BetaalStatus {
  if (f.betaald_op) return "betaald";
  return dagenTussen(f.vervaldatum, vandaag) > 0 ? "te_laat" : "open";
}

export function dagenTeLaat(f: BetaalInfo, vandaag: string): number {
  return Math.max(0, dagenTussen(f.vervaldatum, vandaag));
}

export interface OpenstaandTotaal {
  aantal: number;
  bedrag: number;
  aantalTeLaat: number;
  bedragTeLaat: number;
}

// Alleen definitieve facturen tellen mee: een concept is nog geen vordering. Bedragen in hele centen opgeteld.
export function openstaand(facturen: BetaalInfo[], vandaag: string): OpenstaandTotaal {
  let aantal = 0;
  let cent = 0;
  let aantalTeLaat = 0;
  let centTeLaat = 0;
  for (const f of facturen) {
    if (f.status !== "definitief") continue;
    const s = betaalStatus(f, vandaag);
    if (s === "betaald") continue;
    const c = Math.round(Number(f.totaal_incl) * 100);
    aantal += 1;
    cent += c;
    if (s === "te_laat") {
      aantalTeLaat += 1;
      centTeLaat += c;
    }
  }
  return { aantal, bedrag: cent / 100, aantalTeLaat, bedragTeLaat: centTeLaat / 100 };
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
function langeDatum(d: string): string {
  const [j, m, dag] = d.split("-").map(Number);
  return `${dag} ${MAANDEN[m - 1]} ${j}`;
}
function euro(n: number): string {
  return "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface HerinneringInvoer {
  klant_naam: string;
  factuurnummer: string;
  factuurdatum: string;
  vervaldatum: string;
  totaal_incl: number;
  bedrijfsnaam: string;
  iban: string | null;
  eerderHerinnerd: boolean;
}

// Eerste herinnering is vriendelijk; een tweede is duidelijker over de afspraak maar blijft beleefd.
export function herinneringTekst(i: HerinneringInvoer, vandaag: string): { onderwerp: string; tekst: string } {
  const dagen = Math.max(0, dagenTussen(i.vervaldatum, vandaag));
  const betaalregel = i.iban
    ? `Wil je het bedrag overmaken naar ${i.iban.replace(/(.{4})/g, "$1 ").trim()} t.n.v. ${i.bedrijfsnaam}, onder vermelding van ${i.factuurnummer}?`
    : `Wil je het bedrag overmaken onder vermelding van ${i.factuurnummer}?`;
  const tekst = i.eerderHerinnerd
    ? [
        `Beste ${i.klant_naam},`,
        "",
        `Eerder stuurde ik je een herinnering voor factuur ${i.factuurnummer} van ${langeDatum(i.factuurdatum)} (${euro(i.totaal_incl)}). De vervaldatum was ${langeDatum(i.vervaldatum)}, dat is ${dagen} ${dagen === 1 ? "dag" : "dagen"} geleden, en ik heb nog geen betaling ontvangen.`,
        "",
        `${betaalregel} Laat het me weten als er iets is waardoor je niet kunt betalen, dan denk ik graag met je mee.`,
        "",
        "Heb je al betaald? Dan kun je deze herinnering negeren.",
        "",
        "Met vriendelijke groet,",
        i.bedrijfsnaam,
      ].join("\n")
    : [
        `Beste ${i.klant_naam},`,
        "",
        `Ik zie dat factuur ${i.factuurnummer} van ${langeDatum(i.factuurdatum)} (${euro(i.totaal_incl)}) nog niet is betaald. De vervaldatum was ${langeDatum(i.vervaldatum)}.`,
        "",
        betaalregel,
        "",
        "Heb je al betaald? Dan kun je deze herinnering negeren.",
        "",
        "Met vriendelijke groet,",
        i.bedrijfsnaam,
      ].join("\n");
  return { onderwerp: `${i.eerderHerinnerd ? "Tweede herinnering" : "Herinnering"} factuur ${i.factuurnummer}`, tekst };
}
