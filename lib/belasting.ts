// Inkomstenbelasting voor ondernemers (eenmanszaak/VOF): één gedeelde berekening voor het dashboard, de
// inkomstenbelasting-modus, de chat en de tips. Bewust zonder app-imports, zodat alles los te testen is.
//
// Alle regels van een jaar staan op één plek (JAAR_REGELS). Bronnen 2026: Belastingdienst (heffingskortingen,
// arbeidsinkomen), Belastingplan 2026. Het is een INDICATIE voor een ondernemer zonder partner, loondienst of
// eigen woning, geen aangifte.

export interface Schijf {
  tot: number;
  tarief: number;
}

export interface JaarRegels {
  jaar: number;
  // Schijven box 1 onder de AOW-leeftijd, inclusief premies volksverzekeringen
  schijven: Schijf[];
  zelfstandigenaftrek: number;
  startersaftrek: number;
  mkbPercentage: number;
  // Kleinschaligheidsinvesteringsaftrek
  kia: { minimum: number; ondergrens: number; percentage: number; plafondTot: number; plafondBedrag: number; afbouwTot: number; afbouwPercentage: number };
  algemeneHeffingskorting: { max: number; afbouwVanaf: number; afbouwTot: number; afbouwPercentage: number };
  arbeidskorting: { grens1: number; grens2: number; grens3: number; grens4: number; opbouw1: number; basis2: number; opbouw2: number; basis3: number; opbouw3: number; max: number; afbouw: number };
  zvw: { percentage: number; maxInkomen: number };
}

export const JAAR_REGELS: Record<number, JaarRegels> = {
  2026: {
    jaar: 2026,
    schijven: [
      { tot: 38883, tarief: 0.3575 },
      { tot: 78426, tarief: 0.3756 },
      { tot: Infinity, tarief: 0.495 },
    ],
    zelfstandigenaftrek: 1200,
    startersaftrek: 2123,
    mkbPercentage: 0.127,
    kia: { minimum: 450, ondergrens: 2900, percentage: 0.28, plafondTot: 71683, plafondBedrag: 20072, afbouwTot: 132746, afbouwPercentage: 0.0756 },
    algemeneHeffingskorting: { max: 3115, afbouwVanaf: 29736, afbouwTot: 78426, afbouwPercentage: 0.06398 },
    arbeidskorting: { grens1: 11965, grens2: 25845, grens3: 45592, grens4: 132920, opbouw1: 0.08324, basis2: 996, opbouw2: 0.31009, basis3: 5300, opbouw3: 0.0195, max: 5685, afbouw: 0.0651 },
    zvw: { percentage: 0.0485, maxInkomen: 79409 },
  },
};

export const LAATSTE_BEKENDE_JAAR = 2026;

// Voor een jaar zonder eigen regels gebruiken we de laatst bekende en zeggen we dat erbij.
export function regelsVoorJaar(jaar: number): { regels: JaarRegels; exact: boolean } {
  const r = JAAR_REGELS[jaar];
  return r ? { regels: r, exact: true } : { regels: JAAR_REGELS[LAATSTE_BEKENDE_JAAR], exact: false };
}

export interface IbAntwoorden {
  // Werk je minstens 1.225 uur aan je bedrijf? null = nog niet zeker (we rekenen dan met ja)
  urencriterium?: boolean | null;
  starter?: boolean | null;
  // Hoe vaak is de startersaftrek al gebruikt (0, 1 of 2; bij 3 is hij op)
  starterEerderGebruikt?: number | null;
  kiaInvestering?: number | null;
  aovPremie?: number | null;
  pensioenPremie?: number | null;
  // Alleen VOF: jouw aandeel in de winst in procenten
  vofAandeel?: number | null;
}

export interface IbInvoer {
  winst: number; // winst uit onderneming van het jaar (excl. BTW), voor jouw aandeel
  antwoorden: IbAntwoorden;
  jaar: number;
}

export interface IbStap {
  sleutel: string;
  label: string;
  bedrag: number; // positief = optelling, negatief = aftrek (voor weergave)
}

export interface IbResultaat {
  jaar: number;
  regelsExact: boolean;
  winst: number;
  kia: number;
  zelfstandigenaftrek: number;
  startersaftrek: number;
  winstNaAftrek: number;
  mkbVrijstelling: number;
  belastbareWinst: number;
  persoonlijkeAftrek: number; // AOV + pensioen
  inkomenBox1: number;
  brutoIb: number;
  algemeneHeffingskorting: number;
  arbeidskorting: number;
  nettoIb: number;
  zvwBijdrage: number;
  totaal: number;
  effectiefPercentage: number; // totaal als % van de winst
  marginaalTarief: number; // wat een extra euro winst kost, in procent
}

// Afgerond op centen; nooit "-0" (dat zou als € -0,00 op het scherm komen)
const cent = (n: number) => Math.round(n * 100) / 100 + 0;

function progressief(bedrag: number, schijven: Schijf[]): number {
  let rest = Math.max(0, bedrag);
  let vorige = 0;
  let totaal = 0;
  for (const s of schijven) {
    const inSchijf = Math.min(rest, s.tot - vorige);
    if (inSchijf > 0) totaal += inSchijf * s.tarief;
    rest -= inSchijf;
    vorige = s.tot;
    if (rest <= 0) break;
  }
  return totaal;
}

export function kiaAftrek(investering: number, r: JaarRegels): number {
  const k = r.kia;
  if (!(investering > 0) || investering < k.ondergrens) return 0;
  if (investering <= k.plafondTot) return investering * k.percentage;
  if (investering <= k.afbouwTot) return k.plafondBedrag;
  const aftrek = k.plafondBedrag - (investering - k.afbouwTot) * k.afbouwPercentage;
  return Math.max(0, aftrek);
}

export function arbeidskorting(arbeidsinkomen: number, r: JaarRegels): number {
  const a = r.arbeidskorting;
  const x = Math.max(0, arbeidsinkomen);
  if (x <= a.grens1) return x * a.opbouw1;
  if (x <= a.grens2) return a.basis2 + (x - a.grens1) * a.opbouw2;
  if (x <= a.grens3) return a.basis3 + (x - a.grens2) * a.opbouw3;
  if (x <= a.grens4) return Math.max(0, a.max - (x - a.grens3) * a.afbouw);
  return 0;
}

export function algemeneHeffingskorting(verzamelinkomen: number, r: JaarRegels): number {
  const a = r.algemeneHeffingskorting;
  const x = Math.max(0, verzamelinkomen);
  if (x <= a.afbouwVanaf) return a.max;
  if (x >= a.afbouwTot) return 0;
  return Math.max(0, a.max - (x - a.afbouwVanaf) * a.afbouwPercentage);
}

const nietNegatief = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

// De berekening zelf, zonder marginaal tarief (dat rekent met deze functie).
function kern(invoer: IbInvoer): Omit<IbResultaat, "marginaalTarief"> {
  const { regels: r, exact } = regelsVoorJaar(invoer.jaar);
  const a = invoer.antwoorden;
  const winst = Number.isFinite(invoer.winst) ? invoer.winst : 0;
  const positief = Math.max(0, winst);

  // 1. Investeringsaftrek (KIA) verlaagt de winst, maar maakt er geen verlies van
  const kia = Math.min(positief, kiaAftrek(nietNegatief(a.kiaInvestering), r));
  const winstNaKia = positief - kia;

  // 2. Ondernemersaftrek: alleen met urencriterium; samen nooit meer dan de winst
  const urenOk = a.urencriterium !== false;
  const zelfstandigen = urenOk ? Math.min(winstNaKia, r.zelfstandigenaftrek) : 0;
  const starterGeldig = urenOk && a.starter === true && (a.starterEerderGebruikt ?? 0) < 3;
  const starters = starterGeldig ? Math.min(winstNaKia - zelfstandigen, r.startersaftrek) : 0;
  const winstNaAftrek = winstNaKia - zelfstandigen - starters;

  // 3. MKB-winstvrijstelling over de winst na ondernemersaftrek
  const mkb = winstNaAftrek * r.mkbPercentage;
  const belastbareWinst = winstNaAftrek - mkb;

  // 4. Persoonlijke aftrek (AOV, pensioen/lijfrente) verlaagt het inkomen in box 1
  const persoonlijk = Math.min(belastbareWinst, nietNegatief(a.aovPremie) + nietNegatief(a.pensioenPremie));
  const inkomenBox1 = belastbareWinst - persoonlijk;

  // 5. Belasting en heffingskortingen. Het arbeidsinkomen is de winst vóór ondernemersaftrek en MKB-vrijstelling.
  const brutoIb = progressief(inkomenBox1, r.schijven);
  const ahk = algemeneHeffingskorting(inkomenBox1, r);
  const ak = arbeidskorting(winstNaKia, r);
  const nettoIb = Math.max(0, brutoIb - ahk - ak);

  // 6. Bijdrage Zvw over de belastbare winst, tot het maximum bijdrage-inkomen
  const zvw = Math.min(belastbareWinst, r.zvw.maxInkomen) * r.zvw.percentage;

  const totaal = nettoIb + zvw;
  return {
    jaar: invoer.jaar,
    regelsExact: exact,
    winst: cent(winst),
    kia: cent(kia),
    zelfstandigenaftrek: cent(zelfstandigen),
    startersaftrek: cent(starters),
    winstNaAftrek: cent(winstNaAftrek),
    mkbVrijstelling: cent(mkb),
    belastbareWinst: cent(belastbareWinst),
    persoonlijkeAftrek: cent(persoonlijk),
    inkomenBox1: cent(inkomenBox1),
    brutoIb: cent(brutoIb),
    algemeneHeffingskorting: cent(Math.min(ahk, brutoIb)),
    arbeidskorting: cent(Math.min(ak, Math.max(0, brutoIb - ahk))),
    nettoIb: cent(nettoIb),
    zvwBijdrage: cent(zvw),
    totaal: cent(totaal),
    effectiefPercentage: positief > 0 ? Math.round((totaal / positief) * 1000) / 10 : 0,
  };
}

export function berekenIb(invoer: IbInvoer): IbResultaat {
  const basis = kern(invoer);
  // Wat kost een extra euro winst? Gemeten over €100 extra, zodat schijfgrenzen en afbouw meetellen.
  const meer = kern({ ...invoer, winst: invoer.winst + 100 });
  return { ...basis, marginaalTarief: Math.round(((meer.totaal - basis.totaal) / 100) * 1000) / 10 };
}

// Hoeveel scheelt het in belasting als je dit antwoord anders had? (voor het leergedeelte)
export function besparing(invoer: IbInvoer, wijziging: Partial<IbAntwoorden>): number {
  const nu = kern(invoer).totaal;
  const anders = kern({ ...invoer, antwoorden: { ...invoer.antwoorden, ...wijziging } }).totaal;
  return cent(nu - anders);
}

// Een extra aftrekpost (bijv. € 1.000 extra pensioenpremie): wat scheelt dat in belasting?
export function effectExtraAftrek(invoer: IbInvoer, soort: "pensioen" | "aov" | "kia", extra: number): number {
  const a = invoer.antwoorden;
  const wijziging: Partial<IbAntwoorden> =
    soort === "pensioen" ? { pensioenPremie: nietNegatief(a.pensioenPremie) + extra } : soort === "aov" ? { aovPremie: nietNegatief(a.aovPremie) + extra } : { kiaInvestering: nietNegatief(a.kiaInvestering) + extra };
  return besparing(invoer, wijziging);
}

// ---------- weergave: de berekening als stappen ----------

export function ibStappen(r: IbResultaat): IbStap[] {
  const stappen: IbStap[] = [{ sleutel: "winst", label: "Winst uit onderneming", bedrag: r.winst }];
  if (r.kia > 0) stappen.push({ sleutel: "kia", label: "Kleinschaligheidsinvesteringsaftrek", bedrag: 0 - r.kia });
  if (r.zelfstandigenaftrek > 0) stappen.push({ sleutel: "zelfstandigenaftrek", label: "Zelfstandigenaftrek", bedrag: 0 - r.zelfstandigenaftrek });
  if (r.startersaftrek > 0) stappen.push({ sleutel: "startersaftrek", label: "Startersaftrek", bedrag: 0 - r.startersaftrek });
  stappen.push({ sleutel: "mkb", label: "MKB-winstvrijstelling", bedrag: 0 - r.mkbVrijstelling });
  stappen.push({ sleutel: "belastbareWinst", label: "Belastbare winst", bedrag: r.belastbareWinst });
  if (r.persoonlijkeAftrek > 0) stappen.push({ sleutel: "persoonlijk", label: "Aftrek AOV en pensioen", bedrag: 0 - r.persoonlijkeAftrek });
  stappen.push({ sleutel: "brutoIb", label: "Inkomstenbelasting (box 1)", bedrag: r.brutoIb });
  stappen.push({ sleutel: "ahk", label: "Algemene heffingskorting", bedrag: 0 - r.algemeneHeffingskorting });
  stappen.push({ sleutel: "ak", label: "Arbeidskorting", bedrag: 0 - r.arbeidskorting });
  stappen.push({ sleutel: "zvw", label: "Bijdrage Zorgverzekeringswet", bedrag: r.zvwBijdrage });
  stappen.push({ sleutel: "totaal", label: "Totaal om opzij te zetten", bedrag: r.totaal });
  return stappen;
}
