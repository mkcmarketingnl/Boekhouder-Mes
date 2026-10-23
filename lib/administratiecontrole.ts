// Administratiecontrole: vergelijkt wat je ooit hebt opgeslagen met een verse, volledige scan van het originele document
// en laat zien waar het verschilt, met een voorstel om het te herstellen. Bewust zonder app-imports (alleen ./btw,
// ./verrekend en ./namen), zodat alles los te testen is. Er wordt hier NIETS gewijzigd: dit levert alleen bevindingen.
import { naarCenten } from "./btw";
import { zelfdeNaam } from "./namen";
import { type VerrekendeKost } from "./verrekend";

// Zo begint de neutrale melding die de scan geeft bij ingehouden kosten; die telt niet als "de scan was onzeker".
export const INFO_VERREKEND_PREFIX = "Op dit document worden kosten ingehouden";

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
  heeftBtwRegels: boolean;
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
  heeftBtwRegels: boolean;
  verrekende_kosten: VerrekendeKost[] | null;
  eindbedrag: number | null;
  controle_status: "akkoord" | "afwijking" | "niet_geverifieerd" | undefined;
  controle_afwijkingen: string[];
}

export type Ernst = "hoog" | "midden" | "laag";

export type Fix =
  | { soort: "wijzig"; transactie_id: string; velden: { bedrag_incl_btw?: number; btw_percentage?: number; factuurdatum?: string; leverancier?: string; factuurnummer?: string | null; type?: "kosten" | "omzet" } }
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

export function vergelijkDocument(txs: OpgeslagenTx[], scan: ScanUitkomst): ControleResultaat {
  const bevindingen: Bevinding[] = [];
  const scanMeldingen = scan.controle_afwijkingen.filter((m) => !m.startsWith(INFO_VERREKEND_PREFIX));
  const scanOnzeker = scan.controle_status === "niet_geverifieerd" || scanMeldingen.length > 0;

  if (txs.length === 0 || scan.bedrag_incl_btw == null || scan.type == null) {
    return { uitslag: "niet_zeker", bevindingen: [], scanOnzeker: true, scanMeldingen: scanMeldingen.length ? scanMeldingen : ["De controle-scan kon dit document niet goed lezen."] };
  }

  // De hoofdboeking: de grootste boeking van het type dat de scan ziet. Staat er niets van dat type, dan klopt het type niet.
  const vanType = txs.filter((t) => t.type === scan.type).sort((a, b) => b.bedrag_incl_btw - a.bedrag_incl_btw);
  const hoofd = vanType[0] ?? null;

  if (!hoofd) {
    const grootste = [...txs].sort((a, b) => b.bedrag_incl_btw - a.bedrag_incl_btw)[0];
    bevindingen.push({
      id: `type-${grootste.id}`,
      code: "type",
      ernst: "hoog",
      titel: scan.type === "omzet" ? "Dit lijkt omzet, maar is als kosten opgeslagen" : "Dit lijkt een kostenfactuur, maar is als omzet opgeslagen",
      uitleg: "Het soort bepaalt of het bij je omzet of bij je kosten telt, en dus je winst en BTW. De scan ziet aan de afzender dat dit andersom hoort te staan.",
      opgeslagen: grootste.type === "omzet" ? "Omzet" : "Kosten",
      scan: scan.type === "omzet" ? "Omzet" : "Kosten",
      fix: { soort: "wijzig", transactie_id: grootste.id, velden: { type: scan.type } },
    });
  } else {
    // totaalbedrag
    if (!zelfdeBedrag(hoofd.bedrag_incl_btw, scan.bedrag_incl_btw)) {
      bevindingen.push({
        id: `bedrag-${hoofd.id}`,
        code: "bedrag",
        ernst: "hoog",
        titel: "Het bedrag verschilt van het document",
        uitleg: "Een verkeerd bedrag werkt door in je omzet of kosten, je winst en je BTW.",
        opgeslagen: eur(hoofd.bedrag_incl_btw),
        scan: eur(scan.bedrag_incl_btw),
        // Bij meerdere BTW-tarieven hangt het bedrag aan de verdeling per tarief: dat pas je zelf aan
        fix: hoofd.heeftBtwRegels ? { soort: "geen" } : { soort: "wijzig", transactie_id: hoofd.id, velden: { bedrag_incl_btw: scan.bedrag_incl_btw } },
      });
    }

    // BTW: alleen bij één tarief; bij meerdere tarieven moet je zelf de verdeling bekijken
    if (scan.heeftBtwRegels && !hoofd.heeftBtwRegels) {
      bevindingen.push({
        id: `btwregels-${hoofd.id}`,
        code: "btw_regels",
        ernst: "midden",
        titel: "Er staan meerdere BTW-tarieven op het document",
        uitleg: "Op het document staan meerdere BTW-tarieven (bijvoorbeeld 9% en 21%), maar de boeking rekent met één tarief. Open de boeking en vul per tarief het bedrag in.",
        opgeslagen: `${hoofd.btw_percentage}% over het hele bedrag`,
        scan: "meerdere tarieven",
        fix: { soort: "geen" },
      });
    } else if (!scan.heeftBtwRegels && !hoofd.heeftBtwRegels && scan.btw_percentage != null) {
      const btwVerschil = scan.btw_bedrag != null && Math.abs(naarCenten(hoofd.btw_bedrag) - naarCenten(scan.btw_bedrag)) > 2;
      if (Math.abs(hoofd.btw_percentage - scan.btw_percentage) > 0.5 || btwVerschil) {
        bevindingen.push({
          id: `btw-${hoofd.id}`,
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

    // datum
    if (scan.factuurdatum && hoofd.factuurdatum !== scan.factuurdatum) {
      const ander_jaar = hoofd.factuurdatum.slice(0, 4) !== scan.factuurdatum.slice(0, 4);
      bevindingen.push({
        id: `datum-${hoofd.id}`,
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
        id: `naam-${hoofd.id}`,
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
        id: `nummer-${hoofd.id}`,
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
    scan.verrekende_kosten.forEach((kost, i) => {
      const gevonden = extras.find((t) => !gebruikt.has(t.id) && zelfdeBedrag(t.bedrag_incl_btw, kost.bedrag_incl_btw));
      if (gevonden) {
        gebruikt.add(gevonden.id);
        return;
      }
      bevindingen.push({
        id: `kosten-${i}-${naarCenten(kost.bedrag_incl_btw)}`,
        code: "verrekende_kosten",
        ernst: "hoog",
        titel: `Ingehouden kosten ontbreken: ${kost.omschrijving}`,
        uitleg: `Van dit factuurbedrag zijn kosten ingehouden (${eur(kost.bedrag_incl_btw)}, waarvan ${eur(kost.btw_bedrag)} BTW). Die staan nog niet als kostenpost in je administratie. Daardoor is je winst te hoog en mis je de BTW die je mag terugvragen. De omzet blijft het volledige factuurbedrag.`,
        opgeslagen: "niet geboekt",
        scan: `${eur(kost.bedrag_incl_btw)} (${eur(kost.bedrag_excl_btw)} + ${eur(kost.btw_bedrag)} BTW)`,
        fix: { soort: "voeg_kosten_toe", kost },
      });
    });
  } else if (scan.type === "omzet" && scan.eindbedrag != null && scan.bedrag_incl_btw != null && scan.eindbedrag < scan.bedrag_incl_btw - 0.03) {
    bevindingen.push({
      id: "eindbedrag",
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
