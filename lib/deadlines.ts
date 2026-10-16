// Meldingen bovenaan je overzicht: wat moet je binnenkort doen of wat staat er te lang open? Bewust zonder
// app-imports, zodat het los te testen is. Alle datums zijn YYYY-MM-DD in Nederlandse tijd.

export type Tijdvak = "maand" | "kwartaal" | "jaar";

export interface Melding {
  id: string; // stabiel, zodat een weggeklikte melding weggeklikt blijft
  ernst: "info" | "let_op" | "te_laat";
  tekst: string;
  href: string;
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function utc(d: string): number {
  const [j, m, dag] = d.split("-").map(Number);
  return Date.UTC(j, m - 1, dag);
}
const dagenTot = (van: string, tot: string) => Math.round((utc(tot) - utc(van)) / 86400000);
const iso = (j: number, m: number, d: number) => `${j}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const laatsteDag = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate();
const lang = (d: string) => {
  const [j, m, dag] = d.split("-").map(Number);
  return `${dag} ${MAANDEN[m - 1]} ${j}`;
};

export interface BtwTijdvakInfo {
  sleutel: string;
  label: string;
  begin: string;
  einde: string;
  uiterlijk: string;
}

// Het laatst afgesloten BTW-tijdvak en tot wanneer je daarover aangifte moet doen
// (maand/kwartaal: einde van de maand erna; jaar: 31 maart).
export function laatsteBtwTijdvak(tijdvak: Tijdvak, vandaag: string): BtwTijdvakInfo {
  const [j, m] = vandaag.split("-").map(Number);
  if (tijdvak === "jaar") {
    return { sleutel: `jaar-${j - 1}`, label: String(j - 1), begin: iso(j - 1, 1, 1), einde: iso(j - 1, 12, 31), uiterlijk: iso(j, 3, 31) };
  }
  if (tijdvak === "maand") {
    const pm = m === 1 ? 12 : m - 1;
    const pj = m === 1 ? j - 1 : j;
    const uiterlijkM = pm === 12 ? 1 : pm + 1;
    const uiterlijkJ = pm === 12 ? pj + 1 : pj;
    return { sleutel: `maand-${pj}-${pm}`, label: `${MAANDEN[pm - 1]} ${pj}`, begin: iso(pj, pm, 1), einde: iso(pj, pm, laatsteDag(pj, pm)), uiterlijk: iso(uiterlijkJ, uiterlijkM, laatsteDag(uiterlijkJ, uiterlijkM)) };
  }
  const q = Math.floor((m - 1) / 3); // 0..3 = huidig kwartaal
  const pq = q === 0 ? 3 : q - 1;
  const pj = q === 0 ? j - 1 : j;
  const eindM = (pq + 1) * 3;
  const uiterlijkM = eindM === 12 ? 1 : eindM + 1;
  const uiterlijkJ = eindM === 12 ? pj + 1 : pj;
  return { sleutel: `kwartaal-${pj}-q${pq + 1}`, label: `Q${pq + 1} ${pj}`, begin: iso(pj, pq * 3 + 1, 1), einde: iso(pj, eindM, laatsteDag(pj, eindM)), uiterlijk: iso(uiterlijkJ, uiterlijkM, laatsteDag(uiterlijkJ, uiterlijkM)) };
}

export interface MeldingInvoer {
  vandaag: string;
  tijdvak: Tijdvak;
  // Is er in dit tijdvak iets te melden? (er zijn facturen/bonnen). Zonder administratie geen herinnering.
  heeftBtwAdministratie: boolean;
  teLaatAantal: number;
  teLaatBedrag: number;
  uren: { gewerktUren: number; prognoseUren: number; opKoers: boolean } | null;
  // Factureerbare uren die al langer dan twee weken niet gefactureerd zijn
  oudeOpenUren: number;
  // Openstaande verplichtingen met een deadline uit Money mode (alleen nog niet betaalde)
  verplichtingen?: { id: string; naam: string; bedrag: number; deadline: string }[];
}

const eur = (n: number) => "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function berekenMeldingen(i: MeldingInvoer): Melding[] {
  const uit: Melding[] = [];
  const jaar = Number(i.vandaag.slice(0, 4));

  // BTW-aangifte: vanaf 30 dagen vóór de uiterste datum, tot ze voorbij is
  if (i.heeftBtwAdministratie) {
    const t = laatsteBtwTijdvak(i.tijdvak, i.vandaag);
    const dagen = dagenTot(i.vandaag, t.uiterlijk);
    // Na twee weken laten we het los: de app kan niet weten of je al aangifte deed, en blijft niet maandenlang zeuren.
    if (dagen < 0 && dagen >= -14) {
      uit.push({ id: `btw-${t.sleutel}`, ernst: "te_laat", tekst: `De BTW-aangifte over ${t.label} had uiterlijk ${lang(t.uiterlijk)} gedaan moeten zijn. Heb je hem nog niet gedaan? Doe dat zo snel mogelijk.`, href: "/btw" });
    } else if (dagen >= 0 && dagen <= 30) {
      uit.push({ id: `btw-${t.sleutel}`, ernst: dagen <= 7 ? "let_op" : "info", tekst: `BTW-aangifte over ${t.label}: uiterlijk ${lang(t.uiterlijk)} (nog ${dagen} ${dagen === 1 ? "dag" : "dagen"}). Bekijk in de BTW-modus wat je moet invullen.`, href: "/btw" });
    }
  }

  // Aangifte inkomstenbelasting over het vorige jaar: uiterlijk 1 mei
  const mei = iso(jaar, 5, 1);
  const dagenMei = dagenTot(i.vandaag, mei);
  if (dagenMei >= 0 && dagenMei <= 75) {
    uit.push({ id: `ib-${jaar - 1}`, ernst: dagenMei <= 14 ? "let_op" : "info", tekst: `Aangifte inkomstenbelasting ${jaar - 1}: uiterlijk 1 mei (nog ${dagenMei} ${dagenMei === 1 ? "dag" : "dagen"}). Uitstel kun je aanvragen bij de Belastingdienst.`, href: "/belasting" });
  }

  if (i.teLaatAantal > 0) {
    uit.push({ id: `te-laat-${i.teLaatAantal}-${Math.round(i.teLaatBedrag)}`, ernst: "let_op", tekst: `${i.teLaatAantal} ${i.teLaatAantal === 1 ? "factuur is" : "facturen zijn"} te laat betaald (${eur(i.teLaatBedrag)}). Je kunt per factuur een herinnering maken.`, href: "/facturen" });
  }

  if (i.oudeOpenUren > 0) {
    const uren = Math.round(i.oudeOpenUren * 10) / 10;
    uit.push({ id: `uren-open-${Math.round(uren)}`, ernst: "info", tekst: `Je hebt ${String(uren).replace(".", ",")} uur dat al langer dan twee weken niet is gefactureerd.`, href: "/uren" });
  }

  // Urencriterium: pas melden als er echt uren zijn bijgehouden en het jaar al wat gevorderd is
  if (i.uren && i.uren.gewerktUren > 0 && !i.uren.opKoers) {
    const dagen = dagenTot(iso(jaar, 1, 1), i.vandaag) + 1;
    if (dagen >= 60) {
      uit.push({ id: `urencriterium-${jaar}`, ernst: "let_op", tekst: `Op dit tempo haal je het urencriterium (1.225 uur) niet: je komt op ongeveer ${Math.round(i.uren.prognoseUren).toLocaleString("nl-NL")} uur. Dan vervalt je zelfstandigenaftrek.`, href: "/uren" });
    }
  }

  // Verplichtingen met een deadline: een melding op 14, 7, 3 en 1 dag ervoor en op de dag zelf. Daarna elke dag opnieuw
  // (de sleutel bevat dan de datum) tot je de verplichting als betaald markeert.
  for (const v of i.verplichtingen ?? []) {
    const dagen = dagenTot(i.vandaag, v.deadline);
    if (dagen > 14) continue;
    const mijlpaal = dagen < 0 ? `laat-${i.vandaag}` : dagen === 0 ? "0" : dagen <= 1 ? "1" : dagen <= 3 ? "3" : dagen <= 7 ? "7" : "14";
    const wat = `${v.naam} (${eur(v.bedrag)})`;
    const tekst =
      dagen < 0
        ? `${wat} had uiterlijk ${lang(v.deadline)} betaald moeten zijn: ${-dagen} ${-dagen === 1 ? "dag" : "dagen"} te laat. Betaal het zo snel mogelijk of neem contact op om een betalingsregeling te treffen.`
        : dagen === 0
          ? `Vandaag is de deadline voor ${wat}.`
          : `${wat}: deadline ${lang(v.deadline)}, nog ${dagen} ${dagen === 1 ? "dag" : "dagen"}.`;
    uit.push({ id: `verplichting-${v.id}-${mijlpaal}`, ernst: dagen < 0 ? "te_laat" : dagen <= 7 ? "let_op" : "info", tekst, href: "/geld" });
  }

  const volgorde = { te_laat: 0, let_op: 1, info: 2 } as const;
  return uit.sort((a, b) => volgorde[a.ernst] - volgorde[b.ernst]);
}
