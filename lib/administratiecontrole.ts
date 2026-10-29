// Administratiecontrole: vergelijkt wat je ooit hebt opgeslagen met een verse, volledige scan van het originele document
// en laat zien waar het verschilt, met een voorstel om het te herstellen. Bewust zonder app-imports (alleen ./btw,
// ./verrekend en ./namen), zodat alles los te testen is. Er wordt hier NIETS gewijzigd: dit levert alleen bevindingen.
//
// De verschillen worden steeds opnieuw berekend tegen wat er NU is opgeslagen. Pas je een boeking zelf aan, dan verdwijnt
// het verschil dus vanzelf; een eerder gemaakte vergelijking wordt nooit als waarheid bewaard.
import { naarCenten } from "./btw";
import { zelfdeNaam } from "./namen";
import { type VerrekendeKost } from "./verrekend";

// Zo begint de neutrale melding die de scan geeft bij ingehouden kosten; die telt niet als "de scan was onzeker".
export const INFO_VERREKEND_PREFIX = "Op dit document worden kosten ingehouden";

export interface RegelBedrag {
  percentage: number;
  bedrag_incl_btw: number;
}

export interface OpgeslagenTx {
  id: string;
  type: "kosten" | "omzet";
  leverancier: string;
  factuurnummer: string | null;
  factuurdatum: string;
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  btw_percentage: number;
  // bij 2 of meer BTW-tarieven op de boeking: de regels
  btw_regels: RegelBedrag[] | null;
  // gevuld bij een kost die op een verkoopfactuur is ingehouden
  ingehouden_op?: string | null;
}

export interface ScanUitkomst {
  type: "kosten" | "omzet" | null;
  leverancier: string | null;
  factuurnummer: string | null;
  factuurdatum: string | null;
  bedrag_incl_btw: number | null;
  bedrag_excl_btw: number | null;
  btw_bedrag: number | null;
  btw_percentage: number | null;
  // bij 2 of meer BTW-tarieven op het document: de regels zoals de scan ze las
  btw_regels: RegelBedrag[] | null;
  verrekende_kosten: VerrekendeKost[] | null;
  eindbedrag: number | null;
  controle_status: "akkoord" | "afwijking" | "niet_geverifieerd" | undefined;
  controle_afwijkingen: string[];
}

export type Ernst = "hoog" | "midden" | "laag";

export type Fix =
  | { soort: "wijzig"; transactie_id: string; velden: { bedrag_incl_btw?: number; btw_percentage?: number; factuurdatum?: string; leverancier?: string; factuurnummer?: string | null; type?: "kosten" | "omzet" } }
  | { soort: "zet_btw_regels"; transactie_id: string; regels: RegelBedrag[] }
  | { soort: "voeg_kosten_toe"; kost: VerrekendeKost }
  | { soort: "geen" };

export interface Bevinding {
  id: string;
  code: "bedrag" | "btw" | "btw_regels" | "datum" | "naam" | "nummer" | "type" | "verrekende_kosten" | "eindbedrag";
  ernst: Ernst;
  titel: string;
  uitleg: string;
  opgeslagen: string | null;
  scan: string | null;
  fix: Fix;
}

export type ControleUitslag = "klopt" | "afwijking" | "niet_zeker";

export interface ControleResultaat {
  uitslag: ControleUitslag;
  bevindingen: Bevinding[];
  // De controle-scan was zelf niet helemaal zeker (de scans lazen niet hetzelfde): kijk in het document voor je iets aanpast.
  scanOnzeker: boolean;
  scanMeldingen: string[];
}

const eur = (n: number) => "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zelfdeBedrag = (a: number, b: number) => Math.abs(naarCenten(a) - naarCenten(b)) <= 1;
const schoonNummer = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const c = (n: number) => naarCenten(n);

// Een vingerafdruk van de BTW-verdeling: "21:4000|9:6000" (in centen, op percentage gesorteerd).
export function regelSignatuur(regels: RegelBedrag[] | null | undefined): string {
  if (!regels || regels.length < 2) return "enkel";
  return [...regels]
    .sort((a, b) => b.percentage - a.percentage)
    .map((r) => `${r.percentage}:${c(r.bedrag_incl_btw)}`)
    .join("|");
}

function zelfdeRegels(a: RegelBedrag[] | null | undefined, b: RegelBedrag[] | null | undefined): boolean {
  const x = regelSignatuur(a).split("|");
  const y = regelSignatuur(b).split("|");
  if (x.length !== y.length) return false;
  return x.every((deel, i) => {
    const [pa, ca] = deel.split(":");
    const [pb, cb] = y[i].split(":");
    return pa === pb && Math.abs(Number(ca) - Number(cb)) <= 1;
  });
}

const toonRegels = (regels: RegelBedrag[]) =>
  [...regels]
    .sort((a, b) => b.percentage - a.percentage)
    .map((r) => `${r.percentage}%: ${eur(r.bedrag_incl_btw)}`)
    .join(" + ");

// Zet een rij uit de database om naar wat de controle nodig heeft.
export function txUitRij(r: {
  id: string;
  type: "kosten" | "omzet";
  leverancier: string;
  factuurnummer: string | null;
  factuurdatum: string;
  bedrag_incl_btw: number | string;
  bedrag_excl_btw: number | string;
  btw_bedrag: number | string;
  btw_percentage: number | string;
  btw_regels?: { percentage: number; bedrag_incl_btw: number }[] | null;
  ingehouden_op?: string | null;
}): OpgeslagenTx {
  const regels = Array.isArray(r.btw_regels) && r.btw_regels.length >= 2 ? r.btw_regels.map((x) => ({ percentage: Number(x.percentage), bedrag_incl_btw: Number(x.bedrag_incl_btw) })) : null;
  return {
    id: r.id,
    type: r.type,
    leverancier: r.leverancier,
    factuurnummer: r.factuurnummer,
    factuurdatum: r.factuurdatum,
    bedrag_incl_btw: Number(r.bedrag_incl_btw),
    bedrag_excl_btw: Number(r.bedrag_excl_btw),
    btw_bedrag: Number(r.btw_bedrag),
    btw_percentage: Number(r.btw_percentage),
    btw_regels: regels,
    ingehouden_op: r.ingehouden_op ?? null,
  };
}

export function vergelijkDocument(txs: OpgeslagenTx[], scan: ScanUitkomst): ControleResultaat {
  const bevindingen: Bevinding[] = [];
  // De neutrale melding over ingehouden kosten en de jaarcontrole van een nieuwe scan ("valt niet in dit jaar": voor een document uit
  // een eerder jaar altijd waar) zeggen niets over de betrouwbaarheid van de scan.
  const scanMeldingen = scan.controle_afwijkingen.filter((m) => !m.startsWith(INFO_VERREKEND_PREFIX) && !m.includes("valt niet in dit jaar"));
  const scanOnzeker = scan.controle_status === "niet_geverifieerd" || scanMeldingen.length > 0;

  if (txs.length === 0 || scan.bedrag_incl_btw == null || scan.type == null) {
    return { uitslag: "niet_zeker", bevindingen: [], scanOnzeker: true, scanMeldingen: scanMeldingen.length ? scanMeldingen : ["De controle-scan kon dit document niet goed lezen."] };
  }

  // De hoofdboeking: de grootste boeking van het type dat de scan ziet. Staat er niets van dat type, dan klopt het type niet.
  // Kosten die op een factuur zijn ingehouden tellen nooit als hoofdboeking.
  const vanType = txs.filter((t) => t.type === scan.type && !t.ingehouden_op).sort((a, b) => b.bedrag_incl_btw - a.bedrag_incl_btw);
  const hoofd = vanType[0] ?? null;

  if (!hoofd) {
    const grootste = [...txs].filter((t) => !t.ingehouden_op).sort((a, b) => b.bedrag_incl_btw - a.bedrag_incl_btw)[0] ?? txs[0];
    bevindingen.push({
      id: `type-${grootste.id}-${grootste.type}`,
      code: "type",
      ernst: "hoog",
      titel: scan.type === "omzet" ? "Dit lijkt omzet, maar is als kosten opgeslagen" : "Dit lijkt een kostenfactuur, maar is als omzet opgeslagen",
      uitleg: "Het soort bepaalt of het bij je omzet of bij je kosten telt, en dus je winst en BTW. De scan ziet aan de afzender dat dit andersom hoort te staan.",
      opgeslagen: grootste.type === "omzet" ? "Omzet" : "Kosten",
      scan: scan.type === "omzet" ? "Omzet" : "Kosten",
      fix: { soort: "wijzig", transactie_id: grootste.id, velden: { type: scan.type } },
    });
  } else {
    const scanRegels = scan.btw_regels && scan.btw_regels.length >= 2 ? scan.btw_regels : null;
    const somRegels = scanRegels ? scanRegels.reduce((a, r) => a + c(r.bedrag_incl_btw), 0) : 0;
    const regelsKloppen = scanRegels !== null && Math.abs(somRegels - c(scan.bedrag_incl_btw)) <= 2;

    if (scanRegels) {
      // Meerdere BTW-tarieven op het document (bijv. eten 9% + drank 21%): de verdeling moet in de boeking staan.
      if (!zelfdeRegels(hoofd.btw_regels, scanRegels)) {
        bevindingen.push({
          id: `btwregels-${hoofd.id}-${regelSignatuur(hoofd.btw_regels)}`,
          code: "btw_regels",
          ernst: "hoog",
          titel: hoofd.btw_regels ? "De verdeling over de BTW-tarieven verschilt van het document" : "Er staan meerdere BTW-tarieven op het document",
          uitleg: "Een deel van het bedrag valt onder 9% en een deel onder 21% (bijvoorbeeld eten en drinken). De boeking rekent nu anders, waardoor de BTW in je aangifte niet klopt.",
          opgeslagen: hoofd.btw_regels ? toonRegels(hoofd.btw_regels) : `${hoofd.btw_percentage}% over het hele bedrag (${eur(hoofd.bedrag_incl_btw)})`,
          scan: toonRegels(scanRegels),
          fix: regelsKloppen ? { soort: "zet_btw_regels", transactie_id: hoofd.id, regels: scanRegels } : { soort: "geen" },
        });
      }
    } else {
      // Eén tarief: totaalbedrag en BTW vergelijken
      if (!zelfdeBedrag(hoofd.bedrag_incl_btw, scan.bedrag_incl_btw)) {
        bevindingen.push({
          id: `bedrag-${hoofd.id}-${c(hoofd.bedrag_incl_btw)}`,
          code: "bedrag",
          ernst: "hoog",
          titel: "Het bedrag verschilt van het document",
          uitleg: "Een verkeerd bedrag werkt door in je omzet of kosten, je winst en je BTW.",
          opgeslagen: eur(hoofd.bedrag_incl_btw),
          scan: eur(scan.bedrag_incl_btw),
          // Bij meerdere BTW-tarieven op de boeking hangt het bedrag aan de verdeling per tarief: dat pas je zelf aan
          fix: hoofd.btw_regels ? { soort: "geen" } : { soort: "wijzig", transactie_id: hoofd.id, velden: { bedrag_incl_btw: scan.bedrag_incl_btw } },
        });
      }
      if (!hoofd.btw_regels && scan.btw_percentage != null) {
        const btwVerschil = scan.btw_bedrag != null && Math.abs(c(hoofd.btw_bedrag) - c(scan.btw_bedrag)) > 2 && zelfdeBedrag(hoofd.bedrag_incl_btw, scan.bedrag_incl_btw);
        if (Math.abs(hoofd.btw_percentage - scan.btw_percentage) > 0.5 || btwVerschil) {
          bevindingen.push({
            id: `btw-${hoofd.id}-${hoofd.btw_percentage}-${c(hoofd.btw_bedrag)}`,
            code: "btw",
            ernst: "midden",
            titel: "De BTW verschilt van het document",
            uitleg: "Het BTW-percentage bepaalt je BTW-saldo en je rubrieken in de aangifte.",
            opgeslagen: `${hoofd.btw_percentage}% (${eur(hoofd.btw_bedrag)} BTW)`,
            scan: `${scan.btw_percentage}%${scan.btw_bedrag != null ? ` (${eur(scan.btw_bedrag)} BTW)` : ""}`,
            fix: { soort: "wijzig", transactie_id: hoofd.id, velden: { btw_percentage: scan.btw_percentage } },
          });
        }
      }
    }

    // datum
    if (scan.factuurdatum && hoofd.factuurdatum !== scan.factuurdatum) {
      const ander_jaar = hoofd.factuurdatum.slice(0, 4) !== scan.factuurdatum.slice(0, 4);
      bevindingen.push({
        id: `datum-${hoofd.id}-${hoofd.factuurdatum}`,
        code: "datum",
        ernst: ander_jaar ? "hoog" : "midden",
        titel: ander_jaar ? "De datum valt in een ander jaar dan op het document" : "De datum verschilt van het document",
        uitleg: "De datum bepaalt in welk BTW-tijdvak en welk jaar de boeking meetelt.",
        opgeslagen: hoofd.factuurdatum,
        scan: scan.factuurdatum,
        fix: { soort: "wijzig", transactie_id: hoofd.id, velden: { factuurdatum: scan.factuurdatum } },
      });
    }

    // naam (je kunt een naam bewust hebben aangepast, daarom "midden" en geen "hoog")
    if (scan.leverancier && hoofd.leverancier && !zelfdeNaam(hoofd.leverancier, scan.leverancier)) {
      bevindingen.push({
        id: `naam-${hoofd.id}-${hoofd.leverancier}`,
        code: "naam",
        ernst: "midden",
        titel: scan.type === "omzet" ? "De klantnaam verschilt van het document" : "De naam van de leverancier verschilt van het document",
        uitleg: "Heb je de naam bewust zelf aangepast? Dan hoef je niets te doen.",
        opgeslagen: hoofd.leverancier,
        scan: scan.leverancier,
        fix: { soort: "wijzig", transactie_id: hoofd.id, velden: { leverancier: scan.leverancier } },
      });
    }

    // factuurnummer
    if (scan.factuurnummer && hoofd.factuurnummer && schoonNummer(scan.factuurnummer) !== schoonNummer(hoofd.factuurnummer)) {
      bevindingen.push({
        id: `nummer-${hoofd.id}-${schoonNummer(hoofd.factuurnummer)}`,
        code: "nummer",
        ernst: "laag",
        titel: "Het factuurnummer verschilt van het document",
        uitleg: "Een kloppend factuurnummer helpt bij de herkenning van dubbele facturen.",
        opgeslagen: hoofd.factuurnummer,
        scan: scan.factuurnummer,
        fix: { soort: "wijzig", transactie_id: hoofd.id, velden: { factuurnummer: scan.factuurnummer } },
      });
    }
  }

  // Ingehouden kosten (factoring e.d.) die als omzet zijn geboekt zonder dat de kosten er apart bij staan
  if (scan.type === "omzet" && scan.verrekende_kosten && scan.verrekende_kosten.length > 0) {
    const extras = txs.filter((t) => t.id !== hoofd?.id && t.type === "kosten");
    const gebruikt = new Set<string>();
    scan.verrekende_kosten.forEach((kost) => {
      const gevonden = extras.find((t) => !gebruikt.has(t.id) && zelfdeBedrag(t.bedrag_incl_btw, kost.bedrag_incl_btw));
      if (gevonden) {
        gebruikt.add(gevonden.id);
        return;
      }
      bevindingen.push({
        id: `kosten-${hoofd?.id ?? "x"}-${c(kost.bedrag_incl_btw)}`,
        code: "verrekende_kosten",
        ernst: "hoog",
        titel: `Ingehouden kosten ontbreken: ${kost.omschrijving}`,
        uitleg: `Van dit factuurbedrag zijn kosten ingehouden (${eur(kost.bedrag_incl_btw)}, waarvan ${eur(kost.btw_bedrag)} BTW). Die staan nog niet als kostenpost in je administratie. Daardoor is je winst te hoog en mis je de BTW die je mag terugvragen. De omzet blijft het volledige factuurbedrag; de kosten komen er bij de factuur bij te staan.`,
        opgeslagen: "niet geboekt",
        scan: `${eur(kost.bedrag_incl_btw)} (${eur(kost.bedrag_excl_btw)} + ${eur(kost.btw_bedrag)} BTW)`,
        fix: { soort: "voeg_kosten_toe", kost },
      });
    });
  } else if (scan.type === "omzet" && scan.eindbedrag != null && scan.bedrag_incl_btw != null && scan.eindbedrag < scan.bedrag_incl_btw - 0.03) {
    bevindingen.push({
      id: `eindbedrag-${hoofd?.id ?? "x"}`,
      code: "eindbedrag",
      ernst: "midden",
      titel: "Het document noemt een lager eindbedrag",
      uitleg: `Op het document staat een eindbedrag van ${eur(scan.eindbedrag)}, lager dan het factuurbedrag. Zijn er kosten ingehouden (bijvoorbeeld factoring)? Bekijk het document en voeg die kosten zelf toe als dat zo is.`,
      opgeslagen: eur(scan.bedrag_incl_btw),
      scan: eur(scan.eindbedrag),
      fix: { soort: "geen" },
    });
  }

  const volgorde = { hoog: 0, midden: 1, laag: 2 } as const;
  bevindingen.sort((a, b) => volgorde[a.ernst] - volgorde[b.ernst]);
  const uitslag: ControleUitslag = bevindingen.length > 0 ? "afwijking" : scanOnzeker ? "niet_zeker" : "klopt";
  return { uitslag, bevindingen, scanOnzeker, scanMeldingen };
}

// ---------- oude uitkomsten (zonder bewaarde scan) ----------

// Uitkomsten uit de eerste versie van de controle bewaarden alleen de verschillen, niet de scan zelf. Of zo'n verschil nog
// bestaat, bepalen we dan door te kijken of de boeking al is aangepast zoals het voorstel zegt.
export function bevindingNogActueel(b: Bevinding, txs: OpgeslagenTx[]): boolean {
  const fix = b.fix;
  if (fix.soort === "voeg_kosten_toe") {
    return !txs.some((t) => t.type === "kosten" && zelfdeBedrag(t.bedrag_incl_btw, fix.kost.bedrag_incl_btw));
  }
  if (fix.soort === "zet_btw_regels") {
    const tx = txs.find((t) => t.id === fix.transactie_id);
    return !!tx && !zelfdeRegels(tx.btw_regels, fix.regels);
  }
  if (fix.soort === "wijzig") {
    const tx = txs.find((t) => t.id === fix.transactie_id);
    if (!tx) return false; // de boeking bestaat niet meer
    const v = fix.velden;
    const klaar =
      (v.bedrag_incl_btw === undefined || zelfdeBedrag(tx.bedrag_incl_btw, v.bedrag_incl_btw)) &&
      (v.btw_percentage === undefined || Math.abs(tx.btw_percentage - v.btw_percentage) <= 0.5) &&
      (v.factuurdatum === undefined || tx.factuurdatum === v.factuurdatum) &&
      (v.leverancier === undefined || zelfdeNaam(tx.leverancier, v.leverancier)) &&
      (v.factuurnummer === undefined || schoonNummer(tx.factuurnummer) === schoonNummer(v.factuurnummer)) &&
      (v.type === undefined || tx.type === v.type);
    return !klaar;
  }
  // Zonder voorstel (bijv. "meerdere BTW-tarieven"): alleen weg als de boeking nu meerdere tarieven heeft
  if (b.code === "btw_regels") return !txs.some((t) => t.btw_regels);
  return true;
}

// De verschillen die nu nog gelden: met bewaarde scan vers berekend, anders de oude uitkomst gecontroleerd tegen de boekingen.
// `afgehandeld` zijn de verschillen die je bewust zo hebt gelaten.
export function actueleBevindingen(
  txs: OpgeslagenTx[],
  scan: ScanUitkomst | null,
  opgeslagen: Bevinding[],
  afgehandeld: string[]
): { bevindingen: Bevinding[]; scanOnzeker: boolean; scanMeldingen: string[]; uitslag: ControleUitslag } {
  if (scan) {
    const r = vergelijkDocument(txs, scan);
    const open = r.bevindingen.filter((b) => !afgehandeld.includes(b.id));
    return { bevindingen: open, scanOnzeker: r.scanOnzeker, scanMeldingen: r.scanMeldingen, uitslag: open.length > 0 ? "afwijking" : r.scanOnzeker && r.bevindingen.length === 0 ? "niet_zeker" : "klopt" };
  }
  const open = opgeslagen.filter((b) => !afgehandeld.includes(b.id) && bevindingNogActueel(b, txs));
  return { bevindingen: open, scanOnzeker: false, scanMeldingen: [], uitslag: open.length > 0 ? "afwijking" : "klopt" };
}
