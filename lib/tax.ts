import type { Rechtsvorm } from "@/lib/types";

// Tarieven 2026. Puur een indicatie — geen officiële aangifte.
const ZELFSTANDIGENAFTREK = 1200;
const MKB_VRIJSTELLING_PERCENTAGE = 0.127;

const BOX1_SCHIJVEN = [
  { tot: 38883, tarief: 0.3575 },
  { tot: 78426, tarief: 0.3756 },
  { tot: Infinity, tarief: 0.495 },
];

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
}

export function estimateIncomeTax(rechtsvorm: Rechtsvorm, winstDitJaar: number): TaxEstimate {
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
    const naAftrek = Math.max(0, winstDitJaar - (winstDitJaar > 0 ? ZELFSTANDIGENAFTREK : 0));
    const naVrijstelling = naAftrek * (1 - MKB_VRIJSTELLING_PERCENTAGE);
    const ib = progressief(naVrijstelling, BOX1_SCHIJVEN);
    return {
      van_toepassing: true,
      bedrag: ib,
      toelichting:
        rechtsvorm === "vof"
          ? "Inkomstenbelasting (box 1), uitgaand van zelfstandigenaftrek en MKB-winstvrijstelling. Bij een VOF wordt de winst meestal verdeeld tussen vennoten — dit bedrag gaat uit van de volledige winst voor jou alleen."
          : "Inkomstenbelasting (box 1), uitgaand van zelfstandigenaftrek (€1.200) en 12,7% MKB-winstvrijstelling.",
    };
  }

  return {
    van_toepassing: false,
    bedrag: 0,
    toelichting: "Belastingschatting is niet beschikbaar voor deze rechtsvorm — raadpleeg een boekhouder.",
  };
}
