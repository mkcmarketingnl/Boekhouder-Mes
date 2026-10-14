// Kern van de urenregistratie: invoer lezen, afronden en omzetten naar factuurregels. Bewust zonder app-imports,
// zodat alles los te testen is. Tijd wordt altijd in hele minuten bewaard; pas op de factuur wordt op een
// kwartier afgerond (over het totaal per factuurregel, niet per urenregel, zodat er niet stilletjes bij komt).

export interface UrenRegel {
  id: string;
  datum: string; // YYYY-MM-DD
  klant_naam: string;
  project: string | null;
  omschrijving: string | null;
  minuten: number;
  factureerbaar: boolean;
  uurtarief: number | null;
  invoice_id: string | null;
}

export const MAX_MINUTEN_PER_REGEL = 24 * 60;

// Leest "3,5", "3.5", "3", "3:30", "3u30", "3 uur 30", "1h15", "90m", "90 min". Geeft minuten, 0 bij een lege invoer
// en null als het geen geldige duur is. Een duur is nooit negatief en nooit meer dan 24 uur.
export function parseDuur(tekst: string): number | null {
  const s = tekst.trim().toLowerCase().replace(/\s+/g, " ");
  if (s === "") return 0;
  let minuten: number | null = null;

  let m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const min = Number(m[2]);
    if (min < 60) minuten = Number(m[1]) * 60 + min;
  } else if ((m = s.match(/^(\d{1,2}) ?(?:u|uur|h)(?: ?(\d{1,2}) ?(?:m|min|minuten)?)?$/))) {
    const min = m[2] ? Number(m[2]) : 0;
    if (min < 60) minuten = Number(m[1]) * 60 + min;
  } else if ((m = s.match(/^(\d{1,4}) ?(?:m|min|minuten)$/))) {
    minuten = Number(m[1]);
  } else if (/^\d+([.,]\d{1,4})?$/.test(s)) {
    minuten = Math.round(Number(s.replace(",", ".")) * 60);
  }

  if (minuten === null || !Number.isFinite(minuten)) return null;
  return minuten <= MAX_MINUTEN_PER_REGEL ? minuten : null;
}

// 210 -> "3:30"
export function formatDuur(minuten: number): string {
  const uur = Math.floor(minuten / 60);
  const min = minuten % 60;
  return `${uur}:${String(min).padStart(2, "0")}`;
}

// 210 -> "3,5 uur" (decimaal, zoals het op een factuur staat)
export function formatUren(uren: number): string {
  const tekst = String(Math.round(uren * 100) / 100).replace(".", ",");
  return `${tekst} uur`;
}

// Afronden op een kwartier (dichtstbijzijnde). Alles boven 0 minuten is minstens een kwartier.
export function kwartierUren(minuten: number): number {
  if (minuten <= 0) return 0;
  return Math.max(1, Math.round(minuten / 15)) / 4;
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export function korteDatum(datum: string): string {
  const [, m, d] = datum.split("-").map(Number);
  return `${d} ${MAANDEN[m - 1]}`;
}

export interface FactuurRegelUitUren {
  omschrijving: string;
  toelichting: string;
  aantal: number;
  prijs_excl: number;
  btw_percentage: number;
}

export interface UrenNaarFactuur {
  regels: FactuurRegelUitUren[];
  totaalMinuten: number;
  // Uren zonder uurtarief: die kunnen niet worden gefactureerd.
  zonderTarief: UrenRegel[];
}

// Groepeert uren per project en tarief tot factuurregels. Per regel: aantal = totaal gerond op een kwartier,
// prijs = uurtarief, toelichting = welke dag wat is gedaan (zodat de klant kan nalopen waar de uren vandaan komen).
export function urenNaarFactuurRegels(uren: UrenRegel[], btwPercentage: number): UrenNaarFactuur {
  const zonderTarief = uren.filter((u) => u.uurtarief == null);
  const metTarief = uren.filter((u) => u.uurtarief != null).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));

  const groepen = new Map<string, UrenRegel[]>();
  for (const u of metTarief) {
    const sleutel = `${(u.project ?? "").trim().toLowerCase()}|${u.uurtarief}`;
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), u]);
  }

  const regels: FactuurRegelUitUren[] = [];
  for (const groep of groepen.values()) {
    const totaal = groep.reduce((a, u) => a + u.minuten, 0);
    const bijDag = new Map<string, { minuten: number; teksten: string[] }>();
    for (const u of groep) {
      const dag = bijDag.get(u.datum) ?? { minuten: 0, teksten: [] };
      dag.minuten += u.minuten;
      const t = (u.omschrijving ?? "").trim();
      if (t && !dag.teksten.includes(t)) dag.teksten.push(t);
      bijDag.set(u.datum, dag);
    }
    const dagen = [...bijDag.entries()].map(([datum, d]) => {
      const uren = Math.round((d.minuten / 60) * 100) / 100;
      return `${korteDatum(datum)}: ${String(uren).replace(".", ",")} u${d.teksten.length ? ` — ${d.teksten.join(", ")}` : ""}`;
    });
    let toelichting = "";
    let getoond = 0;
    for (const regel of dagen) {
      const kandidaat = toelichting ? `${toelichting}\n${regel}` : regel;
      if (kandidaat.length > 440) break;
      toelichting = kandidaat;
      getoond += 1;
    }
    if (getoond < dagen.length) toelichting += `\n… en ${dagen.length - getoond} ${dagen.length - getoond === 1 ? "dag" : "dagen"} meer`;

    regels.push({
      omschrijving: (groep[0].project ?? "").trim() || "Werkzaamheden",
      toelichting,
      aantal: kwartierUren(totaal),
      prijs_excl: Number(groep[0].uurtarief),
      btw_percentage: btwPercentage,
    });
  }
  return { regels, totaalMinuten: metTarief.reduce((a, u) => a + u.minuten, 0), zonderTarief };
}

// ---------- overzichten ----------

export function somMinuten(uren: Pick<UrenRegel, "minuten">[]): number {
  return uren.reduce((a, u) => a + u.minuten, 0);
}

export interface OpenPerKlant {
  klant_naam: string;
  minuten: number;
  bedrag: number; // uurtarief x uren, zonder afronding (indicatie)
  zonderTarief: number;
}

// Wat is er nog niet gefactureerd, per klant?
export function openPerKlant(uren: UrenRegel[]): OpenPerKlant[] {
  const per = new Map<string, OpenPerKlant>();
  for (const u of uren) {
    if (!u.factureerbaar || u.invoice_id) continue;
    const sleutel = u.klant_naam.trim().toLowerCase();
    const x = per.get(sleutel) ?? { klant_naam: u.klant_naam.trim(), minuten: 0, bedrag: 0, zonderTarief: 0 };
    x.minuten += u.minuten;
    if (u.uurtarief == null) x.zonderTarief += 1;
    else x.bedrag += (u.minuten / 60) * u.uurtarief;
    per.set(sleutel, x);
  }
  return [...per.values()].sort((a, b) => b.bedrag - a.bedrag);
}

// ---------- urencriterium ----------

export const URENCRITERIUM_UREN = 1225;

export interface UrencriteriumStand {
  gewerktUren: number;
  doelUren: number;
  procent: number;
  // Verwachting aan het einde van het jaar als je zo doorwerkt
  prognoseUren: number;
  nodigPerWeek: number; // uren per week voor de rest van het jaar om te halen
  opKoers: boolean;
}

// `vandaag` is YYYY-MM-DD. Rekent met de kalenderdagen die al voorbij zijn.
export function urencriteriumStand(gewerktMinuten: number, vandaag: string): UrencriteriumStand {
  const [j, m, d] = vandaag.split("-").map(Number);
  const start = Date.UTC(j, 0, 1);
  const nu = Date.UTC(j, m - 1, d);
  const einde = Date.UTC(j + 1, 0, 1);
  const dagenVoorbij = Math.max(1, Math.round((nu - start) / 86400000) + 1);
  const dagenJaar = Math.round((einde - start) / 86400000);
  const dagenRest = Math.max(0, dagenJaar - dagenVoorbij);
  const gewerkt = gewerktMinuten / 60;
  const prognose = (gewerkt / dagenVoorbij) * dagenJaar;
  const nodig = Math.max(0, URENCRITERIUM_UREN - gewerkt);
  return {
    gewerktUren: gewerkt,
    doelUren: URENCRITERIUM_UREN,
    procent: Math.min(100, (gewerkt / URENCRITERIUM_UREN) * 100),
    prognoseUren: prognose,
    nodigPerWeek: dagenRest > 0 ? nodig / (dagenRest / 7) : nodig,
    opKoers: gewerkt >= URENCRITERIUM_UREN || prognose >= URENCRITERIUM_UREN,
  };
}
