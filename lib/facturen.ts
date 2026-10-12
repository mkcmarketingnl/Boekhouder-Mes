// Kern van de factuurmaker: berekenen, nummeren en controleren. Bewust zonder app-imports (alleen ./btw),
// zodat alles los te testen is. Alle bedragen in hele centen; BTW wordt per tarief berekend over de
// som van de grondslagen (zoals de wet het toestaat) en nooit per regel afgerond en opgeteld.
import { naarCenten, naarEuro, type BtwRegel } from "./btw";

export type FactuurTemplate = "klassiek" | "modern" | "minimaal";
export const TEMPLATES: { id: FactuurTemplate; naam: string; omschrijving: string }[] = [
  { id: "klassiek", naam: "Klassiek", omschrijving: "Rustig en formeel, met lijntjes." },
  { id: "modern", naam: "Modern", omschrijving: "Opvallende kop, veel witruimte." },
  { id: "minimaal", naam: "Minimaal", omschrijving: "Alleen de essentie, zonder franje." },
];

export interface FactuurRegel {
  omschrijving: string;
  aantal: number;
  prijs_excl: number; // per stuk, excl. BTW
  btw_percentage: number;
}

export interface Afzender {
  bedrijfsnaam: string;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  iban: string | null;
  bic: string | null;
  telefoon: string | null;
  email: string | null;
  website: string | null;
}

export interface FactuurGegevens {
  factuurnummer: string;
  klant_naam: string;
  klant_adres: string | null;
  klant_postcode: string | null;
  klant_plaats: string | null;
  klant_land: string;
  klant_btw_nummer: string | null;
  klant_kvk: string | null;
  factuurdatum: string; // YYYY-MM-DD
  vervaldatum: string;
  leverdatum: string | null;
  regels: FactuurRegel[];
  btw_verlegd: boolean;
  kor: boolean;
  notitie: string | null;
}

export interface BtwPerTarief {
  percentage: number;
  grondslag: number; // excl.
  btw: number;
}

export interface FactuurTotalen {
  excl: number;
  btw: number;
  incl: number;
  perTarief: BtwPerTarief[]; // hoogste tarief eerst
}

export const regelTotaalExcl = (r: FactuurRegel) => naarEuro(Math.round(Number(r.aantal) * naarCenten(Number(r.prijs_excl))));

export function berekenTotalen(regels: FactuurRegel[], opties: { btw_verlegd?: boolean; kor?: boolean } = {}): FactuurTotalen {
  const nulBtw = !!opties.btw_verlegd || !!opties.kor;
  const grondslagCenten = new Map<number, number>();
  for (const r of regels) {
    const aantal = Number(r.aantal);
    const prijs = Number(r.prijs_excl);
    if (!Number.isFinite(aantal) || !Number.isFinite(prijs)) continue;
    const pct = nulBtw ? 0 : Number(r.btw_percentage);
    grondslagCenten.set(pct, (grondslagCenten.get(pct) ?? 0) + Math.round(aantal * naarCenten(prijs)));
  }
  const perTarief: BtwPerTarief[] = [...grondslagCenten.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([percentage, g]) => ({ percentage, grondslag: naarEuro(g), btw: naarEuro(Math.round((g * percentage) / 100)) }));
  const excl = perTarief.reduce((a, t) => a + naarCenten(t.grondslag), 0);
  const btw = perTarief.reduce((a, t) => a + naarCenten(t.btw), 0);
  return { excl: naarEuro(excl), btw: naarEuro(btw), incl: naarEuro(excl + btw), perTarief };
}

// Voor de omzetboeking: de BTW-regels zoals de rest van de app ze kent (alleen bij 2+ tarieven).
export function naarBtwRegels(t: FactuurTotalen): BtwRegel[] | null {
  if (t.perTarief.length < 2) return null;
  return t.perTarief.map((x) => ({
    percentage: x.percentage,
    bedrag_excl_btw: x.grondslag,
    btw_bedrag: x.btw,
    bedrag_incl_btw: naarEuro(naarCenten(x.grondslag) + naarCenten(x.btw)),
  }));
}

// ---------- nummering & data ----------

export function formatFactuurnummer(prefix: string, volgnummer: number): string {
  return `${prefix}${String(volgnummer).padStart(3, "0")}`;
}

// Het volgnummer uit een factuurnummer, bijv. "2026-014" -> 14 (het laatste getal).
export function volgnummerUit(nummer: string): number | null {
  const m = nummer.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

// Vandaag in Nederlandse tijd (niet UTC: tussen 00:00 en 02:00 loopt UTC een dag achter).
export function vandaagNl(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

export function plusDagen(datum: string, dagen: number): string {
  const [j, m, d] = datum.split("-").map(Number);
  const dt = new Date(Date.UTC(j, m - 1, d + dagen));
  return dt.toISOString().slice(0, 10);
}

// ---------- controles in code ----------

export type Ernst = "fout" | "let_op";
export interface Bevinding {
  ernst: Ernst;
  veld: string;
  melding: string;
  uitleg: string; // waarom dit een probleem is, in gewone taal
}

// IBAN-controle volgens ISO 13616 (mod 97). Vangt typfouten in het rekeningnummer op.
export function isGeldigeIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const omgezet = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of omgezet) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

const NL_BTW = /^NL\d{9}B\d{2}$/i;
const EU_LANDEN = ["België", "Duitsland", "Frankrijk", "Spanje", "Italië", "Ierland", "Luxemburg", "Oostenrijk", "Portugal", "Polen", "Zweden", "Denemarken", "Finland", "Griekenland", "Tsjechië", "Hongarije", "Roemenië", "Bulgarije", "Kroatië", "Slovenië", "Slowakije", "Estland", "Letland", "Litouwen", "Malta", "Cyprus"];
export const LANDEN = ["Nederland", ...EU_LANDEN, "Buiten de EU"];
export const isEuLand = (land: string) => EU_LANDEN.includes(land);

export function controleerFactuur(
  f: FactuurGegevens,
  afzender: Afzender,
  context: { vorigNummer?: string | null; vandaag: string }
): Bevinding[] {
  const b: Bevinding[] = [];
  const fout = (veld: string, melding: string, uitleg: string) => b.push({ ernst: "fout", veld, melding, uitleg });
  const letOp = (veld: string, melding: string, uitleg: string) => b.push({ ernst: "let_op", veld, melding, uitleg });
  const leeg = (s: string | null | undefined) => !s || !s.trim();

  // afzender
  if (leeg(afzender.bedrijfsnaam)) fout("afzender", "Je bedrijfsnaam ontbreekt.", "Een factuur moet de naam van de leverancier (jij) bevatten.");
  if (leeg(afzender.adres) || leeg(afzender.postcode) || leeg(afzender.plaats))
    fout("afzender", "Je bedrijfsadres is niet compleet.", "Op een factuur moeten het volledige adres van de leverancier staan. Vul het in bij Factuurinstellingen.");
  if (!f.kor && leeg(afzender.btw_nummer))
    fout("afzender", "Je BTW-nummer ontbreekt.", "Reken je BTW, dan is je BTW-identificatienummer verplicht op de factuur (de klant heeft het nodig voor zijn aangifte).");
  if (!leeg(afzender.btw_nummer) && !NL_BTW.test(afzender.btw_nummer!.replace(/[\s.]/g, "")))
    letOp("afzender", "Je BTW-nummer lijkt niet het juiste formaat te hebben.", "Een Nederlands BTW-nummer ziet eruit als NL123456789B01 (NL, 9 cijfers, B, 2 cijfers).");
  if (leeg(afzender.kvk_nummer)) letOp("afzender", "Je KVK-nummer ontbreekt.", "Niet wettelijk verplicht op elke factuur, maar klanten verwachten het en het hoort bij een professionele factuur.");
  else if (!/^\d{8}$/.test(afzender.kvk_nummer!.replace(/\s/g, ""))) letOp("afzender", "Je KVK-nummer heeft niet 8 cijfers.", "Een KVK-nummer bestaat altijd uit 8 cijfers.");
  if (leeg(afzender.iban)) fout("afzender", "Je IBAN ontbreekt.", "Zonder rekeningnummer weet je klant niet waarheen hij moet betalen.");
  else if (!isGeldigeIban(afzender.iban!)) fout("afzender", "Je IBAN lijkt niet te kloppen.", "De controlecijfers in het rekeningnummer kloppen niet; waarschijnlijk is er een typefout. Een fout IBAN betekent dat betalingen niet aankomen.");

  // klant
  if (leeg(f.klant_naam)) fout("klant", "De naam van je klant ontbreekt.", "Een factuur moet de naam van de afnemer bevatten.");
  if (leeg(f.klant_adres) || leeg(f.klant_postcode) || leeg(f.klant_plaats))
    letOp("klant", "Het adres van je klant is niet compleet.", "Bij zakelijke klanten hoort het volledige adres op de factuur; zonder adres kan de klant de factuur mogelijk niet verwerken.");

  // nummer & data
  if (leeg(f.factuurnummer)) fout("nummer", "Het factuurnummer ontbreekt.", "Elke factuur heeft een uniek, oplopend nummer nodig.");
  else if (context.vorigNummer) {
    const nu = volgnummerUit(f.factuurnummer);
    const vorig = volgnummerUit(context.vorigNummer);
    if (nu != null && vorig != null && nu !== vorig + 1)
      letOp("nummer", `Het factuurnummer sluit niet aan op je vorige factuur (${context.vorigNummer}).`, "Factuurnummers moeten aaneengesloten oplopen; een gat of herhaling valt bij een controle van de Belastingdienst op.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.factuurdatum)) fout("datum", "De factuurdatum is ongeldig.", "Vul een geldige datum in.");
  else if (f.factuurdatum > plusDagen(context.vandaag, 30)) letOp("datum", "De factuurdatum ligt ver in de toekomst.", "Een factuur dateer je op de dag van levering of verzending; een datum ver vooruit is meestal een vergissing.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.vervaldatum)) fout("datum", "De vervaldatum is ongeldig.", "Vul een geldige vervaldatum in.");
  else if (/^\d{4}-\d{2}-\d{2}$/.test(f.factuurdatum) && f.vervaldatum < f.factuurdatum)
    fout("datum", "De vervaldatum ligt vóór de factuurdatum.", "Een factuur kan niet al verlopen zijn op het moment dat hij wordt verstuurd.");

  // regels
  if (f.regels.length === 0) fout("regels", "Er staat nog geen product of dienst op de factuur.", "Een factuur moet omschrijven wat er is geleverd.");
  f.regels.forEach((r, i) => {
    const n = i + 1;
    if (leeg(r.omschrijving)) fout("regels", `Regel ${n}: omschrijving ontbreekt.`, "Elke regel moet omschrijven wat er is geleverd.");
    if (!(Number(r.aantal) > 0)) fout("regels", `Regel ${n}: het aantal moet groter zijn dan 0.`, "Een aantal van 0 of lager geeft een onjuist bedrag.");
    if (!Number.isFinite(Number(r.prijs_excl))) fout("regels", `Regel ${n}: de prijs is ongeldig.`, "Vul een prijs excl. BTW in.");
    else if (Number(r.prijs_excl) < 0) letOp("regels", `Regel ${n}: negatieve prijs.`, "Een negatief bedrag hoort bij een creditnota of korting. Klopt dat zo?");
    if (![21, 9, 0].includes(Number(r.btw_percentage))) fout("btw", `Regel ${n}: BTW-tarief ${r.btw_percentage}% bestaat niet.`, "In Nederland zijn de tarieven 21%, 9% en 0%.");
  });

  // BTW-situatie
  const eu = isEuLand(f.klant_land);
  const buitenEu = f.klant_land === "Buiten de EU";
  const heeftBtwRegel = f.regels.some((r) => Number(r.btw_percentage) > 0);
  if (f.btw_verlegd && leeg(f.klant_btw_nummer)) fout("btw", "BTW verlegd, maar je klant heeft geen BTW-nummer ingevuld.", "BTW verleggen mag alleen naar een klant met een geldig BTW-nummer; zonder dat nummer moet je gewoon BTW rekenen.");
  if (f.btw_verlegd && heeftBtwRegel) letOp("btw", "BTW is verlegd, maar er staat nog een tarief boven 0% op een regel.", "Bij verlegging reken je zelf geen BTW; de app zet het bedrag daarom op 0, maar controleer of dat de bedoeling is.");
  if (!f.btw_verlegd && !f.kor && eu && !leeg(f.klant_btw_nummer))
    letOp("btw", "Zakelijke klant in een ander EU-land: reken je wel de juiste BTW?", "Diensten aan een zakelijke klant in een ander EU-land zijn meestal “BTW verlegd” (0%, met vermelding en het BTW-nummer van de klant). Dan moet je ook een opgaaf intracommunautaire prestaties doen.");
  if (!f.btw_verlegd && !f.kor && eu && leeg(f.klant_btw_nummer))
    letOp("btw", "Klant in een ander EU-land zonder BTW-nummer.", "Zonder BTW-nummer behandel je de klant als particulier en reken je meestal gewoon Nederlandse BTW — klopt dat?");
  if (buitenEu && heeftBtwRegel && !f.kor)
    letOp("btw", "Klant buiten de EU, maar er wordt wel BTW gerekend.", "Diensten en leveringen aan klanten buiten de EU zijn vaak zonder Nederlandse BTW (0%). Controleer of dat hier geldt.");
  if (f.kor && heeftBtwRegel) letOp("btw", "KOR actief, maar er staat BTW op de factuur.", "Met de kleineondernemersregeling reken je geen BTW; de app zet het bedrag daarom op 0.");
  if (!f.btw_verlegd && !f.kor && !eu && !buitenEu && f.regels.length > 0 && !heeftBtwRegel)
    letOp("btw", "Alle regels staan op 0% BTW terwijl je klant in Nederland zit.", "Voor een Nederlandse klant reken je normaal 21% of 9% BTW, tenzij je een vrijstelling hebt. Klopt 0%?");

  // vermeldingen
  const notitie = (f.notitie ?? "").toLowerCase();
  if (f.btw_verlegd && !/verlegd/.test(notitie)) letOp("notitie", "Vermeld “BTW verlegd” op de factuur.", "Bij verlegging moet op de factuur staan dat de BTW is verlegd; de app zet die tekst er automatisch bij op het document.");

  return b;
}

// Tekst die bij bijzondere BTW-situaties automatisch op de factuur komt.
export function btwVermelding(f: Pick<FactuurGegevens, "btw_verlegd" | "kor" | "klant_land">): string | null {
  if (f.kor) return "Vrijgesteld van BTW op grond van de kleineondernemersregeling (KOR).";
  if (f.btw_verlegd) return isEuLand(f.klant_land) ? "BTW verlegd (intracommunautaire prestatie): de afnemer is de BTW verschuldigd." : "BTW verlegd naar de afnemer.";
  return null;
}

// ---------- database-rijen ----------

export interface InvoiceSettings {
  user_id: string;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string;
  iban: string | null;
  bic: string | null;
  telefoon: string | null;
  email: string | null;
  website: string | null;
  betaaltermijn_dagen: number;
  factuurnummer_prefix: string;
  volgend_factuurnummer: number;
  standaard_template: FactuurTemplate;
  standaard_notitie: string | null;
  kor: boolean;
}

export interface AiControle {
  samenvatting: string;
  bevindingen: Bevinding[];
}

export interface SalesInvoice {
  id: string;
  user_id: string;
  status: "concept" | "definitief";
  factuurnummer: string;
  klant_naam: string;
  klant_adres: string | null;
  klant_postcode: string | null;
  klant_plaats: string | null;
  klant_land: string;
  klant_btw_nummer: string | null;
  klant_kvk: string | null;
  klant_email: string | null;
  factuurdatum: string;
  vervaldatum: string;
  leverdatum: string | null;
  regels: FactuurRegel[];
  btw_verlegd: boolean;
  kor: boolean;
  notitie: string | null;
  template: FactuurTemplate;
  afzender: Afzender | null;
  totaal_excl: number;
  totaal_btw: number;
  totaal_incl: number;
  transaction_id: string | null;
  ai_controle: AiControle | null;
  ai_controle_op: string | null;
  created_at: string;
}

// Het bedrijfsprofiel + factuurinstellingen samengevoegd tot wat er op de factuur komt te staan.
export function bouwAfzender(
  profiel: { bedrijfsnaam: string; kvk_nummer: string | null; btw_nummer: string | null },
  s: Pick<InvoiceSettings, "adres" | "postcode" | "plaats" | "land" | "iban" | "bic" | "telefoon" | "email" | "website"> | null
): Afzender {
  return {
    bedrijfsnaam: profiel.bedrijfsnaam,
    adres: s?.adres ?? null,
    postcode: s?.postcode ?? null,
    plaats: s?.plaats ?? null,
    land: s?.land ?? "Nederland",
    kvk_nummer: profiel.kvk_nummer,
    btw_nummer: profiel.btw_nummer,
    iban: s?.iban ?? null,
    bic: s?.bic ?? null,
    telefoon: s?.telefoon ?? null,
    email: s?.email ?? null,
    website: s?.website ?? null,
  };
}

// PostgREST meldt een ontbrekende tabel (migratie 0005 nog niet uitgevoerd) met deze codes/teksten.
export function isTabelOntbreekt(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /could not find the table|does not exist/i.test(error.message ?? "");
}

export const MIGRATIE_MELDING =
  "De factuurmaker heeft een eenmalige database-update nodig (migratie 0005_btw_regels_en_facturen.sql in Supabase).";
