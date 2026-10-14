import type { Rechtsvorm } from "@/lib/types";
import { berekenIb, type IbAntwoorden, type IbResultaat } from "@/lib/belasting";

// Indicatie van de belasting over de winst van dit jaar. Voor eenmanszaak en VOF rekent dit met dezelfde
// berekening als de inkomstenbelasting-modus (lib/belasting.ts); voor een BV met een eenvoudige vennootschapsbelasting.
const VPB_SCHIJVEN = [
  { tot: 200000, tarief: 0.19 },
  { tot: Infinity, tarief: 0.258 },
];

function progressief(bedrag: number, schijven: { tot: number; tarief: number }[]): number {
  let rest = Math.max(0, bedrag);
  let vorige = 0;
  let totaal = 0;
  for (const schijf of schijven) {
    const inDezeSchijf = Math.min(rest, schijf.tot - vorige);
    if (inDezeSchijf > 0) totaal += inDezeSchijf * schijf.tarief;
    rest -= inDezeSchijf;
    vorige = schijf.tot;
    if (rest <= 0) break;
  }
  return totaal;
}

export interface TaxEstimate {
  van_toepassing: boolean;
  bedrag: number;
  toelichting: string;
  // Alleen voor eenmanszaak/VOF: de volledige berekening
  details?: IbResultaat;
  // Heeft de gebruiker de vragen in de inkomstenbelasting-modus beantwoord?
  persoonlijk?: boolean;
}

export function estimateIncomeTax(rechtsvorm: Rechtsvorm, winstDitJaar: number, antwoorden: IbAntwoorden | null = null, jaar: number = new Date().getFullYear()): TaxEstimate {
  if (rechtsvorm === "bv") {
    const vpb = progressief(winstDitJaar, VPB_SCHIJVEN);
    return {
      van_toepassing: true,
      bedrag: vpb,
      toelichting:
        "Vennootschapsbelasting: 19% tot €200.000 winst, 25,8% daarboven. Geen rekening gehouden met salaris van de DGA.",
    };
  }

  if (rechtsvorm === "eenmanszaak" || rechtsvorm === "vof") {
    const aandeel = rechtsvorm === "vof" ? Math.min(100, Math.max(0, antwoorden?.vofAandeel ?? 100)) / 100 : 1;
    const details = berekenIb({ winst: winstDitJaar * aandeel, antwoorden: antwoorden ?? {}, jaar });
    const persoonlijk = antwoorden != null && Object.keys(antwoorden).length > 0;
    const basis =
      "Inkomstenbelasting (box 1) plus bijdrage Zorgverzekeringswet, na zelfstandigenaftrek, MKB-winstvrijstelling en heffingskortingen.";
    return {
      van_toepassing: true,
      bedrag: details.totaal,
      details,
      persoonlijk,
      toelichting:
        basis +
        (rechtsvorm === "vof" ? ` Gerekend met jouw aandeel in de winst (${Math.round(aandeel * 100)}%).` : "") +
        (persoonlijk ? "" : " Beantwoord de vragen in de Inkomstenbelasting-modus voor een nauwkeuriger bedrag.") +
        (details.regelsExact ? "" : " Voor dit jaar zijn de regels nog niet vastgesteld; gerekend met de regels van 2026."),
    };
  }

  return {
    van_toepassing: false,
    bedrag: 0,
    toelichting: "Belastingschatting is niet beschikbaar voor deze rechtsvorm — raadpleeg een boekhouder.",
  };
}
