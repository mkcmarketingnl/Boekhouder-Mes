// Vertaalt de invoer van een gebruiker (één BTW-tarief óf meerdere) naar de bedragen die worden opgeslagen.
// Bewust zonder imports van de app zelf (alleen ./btw), zodat het los te testen is.
import {
  type BtwRegel,
  berekenExclBtw,
  hoofdPercentage,
  isGemengd,
  naarCenten,
  normaliseerRegels,
  totalenVanRegels,
} from "./btw";

export interface BedragBtwWaarde {
  gemengd: boolean;
  // één tarief
  bedragInclBtw: string;
  btwPercentage: number;
  // meerdere tarieven (in het scherm altijd minimaal 2 rijen zolang gemengd = true)
  regels: { percentage: number; bedrag: string }[];
}

export interface Bedragen {
  geldig: boolean;
  fout: string | null;
  totaalIncl: number;
  totaalExcl: number;
  btwTotaal: number;
  btwPercentage: number; // bij meerdere tarieven: dat van de grootste regel
  btwRegels: BtwRegel[] | null; // alleen gevuld bij 2 of meer tarieven
}

export const BTW_VOLGORDE = [21, 9, 0];

export function legeWaarde(standaardPercentage: number): BedragBtwWaarde {
  return { gemengd: false, bedragInclBtw: "", btwPercentage: standaardPercentage, regels: [] };
}

export function waardeUitTransactie(t: {
  btw_regels?: BtwRegel[] | null;
  btw_percentage: number;
  bedrag_incl_btw: number;
}): BedragBtwWaarde {
  if (isGemengd(t.btw_regels)) {
    return {
      gemengd: true,
      bedragInclBtw: String(t.bedrag_incl_btw),
      btwPercentage: Number(t.btw_percentage),
      regels: t.btw_regels.map((r) => ({ percentage: r.percentage, bedrag: String(r.bedrag_incl_btw) })),
    };
  }
  return {
    gemengd: false,
    bedragInclBtw: String(t.bedrag_incl_btw),
    btwPercentage: Number(t.btw_percentage),
    regels: [],
  };
}

export function waardeUitScan(
  scan: {
    bedrag_incl_btw: number | null;
    btw_percentage: number | null;
    btw_regels?: { percentage: number; bedrag_incl_btw: number }[] | null;
  } | null,
  standaardPercentage: number
): BedragBtwWaarde {
  if (!scan) return legeWaarde(standaardPercentage);
  const regels = scan.btw_regels ? normaliseerRegels(scan.btw_regels) : [];
  if (regels.length >= 2) {
    return {
      gemengd: true,
      bedragInclBtw: scan.bedrag_incl_btw != null ? String(scan.bedrag_incl_btw) : "",
      btwPercentage: hoofdPercentage(regels),
      regels: regels.map((r) => ({ percentage: r.percentage, bedrag: String(r.bedrag_incl_btw) })),
    };
  }
  return {
    gemengd: false,
    bedragInclBtw: scan.bedrag_incl_btw != null ? String(scan.bedrag_incl_btw) : "",
    btwPercentage: scan.btw_percentage ?? standaardPercentage,
    regels: [],
  };
}

// Zet de gebruiker van één naar meerdere tarieven: de huidige regel blijft staan, plus een lege tweede.
export function naarGemengd(w: BedragBtwWaarde): BedragBtwWaarde {
  const tweede = BTW_VOLGORDE.find((p) => p !== w.btwPercentage) ?? 9;
  return {
    ...w,
    gemengd: true,
    regels: [
      { percentage: w.btwPercentage, bedrag: w.bedragInclBtw },
      { percentage: tweede, bedrag: "" },
    ],
  };
}

// Terug naar één tarief (bijv. als een regel wordt verwijderd): het totaal en het grootste tarief blijven.
export function naarEnkel(w: BedragBtwWaarde): BedragBtwWaarde {
  const b = bedragenUitWaarde(w);
  return {
    ...w,
    gemengd: false,
    btwPercentage: w.regels.length > 0 ? hoofdPercentageUitInvoer(w.regels) : w.btwPercentage,
    bedragInclBtw: b.totaalIncl > 0 ? String(b.totaalIncl) : "",
    regels: [],
  };
}

function hoofdPercentageUitInvoer(regels: { percentage: number; bedrag: string }[]): number {
  let beste = regels[0];
  for (const r of regels) if ((Number(r.bedrag) || 0) > (Number(beste.bedrag) || 0)) beste = r;
  return beste.percentage;
}

export function bedragenUitWaarde(w: BedragBtwWaarde): Bedragen {
  if (!w.gemengd) {
    const totaal = Number(w.bedragInclBtw);
    if (!Number.isFinite(totaal) || totaal <= 0) {
      return { geldig: false, fout: "Vul een geldig totaalbedrag in.", totaalIncl: 0, totaalExcl: 0, btwTotaal: 0, btwPercentage: w.btwPercentage, btwRegels: null };
    }
    const { bedragExclBtw, btwBedrag } = berekenExclBtw(totaal, w.btwPercentage);
    return {
      geldig: true,
      fout: null,
      totaalIncl: naarCenten(totaal) / 100,
      totaalExcl: bedragExclBtw,
      btwTotaal: btwBedrag,
      btwPercentage: w.btwPercentage,
      btwRegels: null,
    };
  }

  const ingevuld = w.regels.map((r) => ({ percentage: r.percentage, bedrag_incl_btw: Number(r.bedrag) || 0 }));
  const regels = normaliseerRegels(ingevuld);
  if (regels.length === 0) {
    return { geldig: false, fout: "Vul bij elk BTW-tarief het bedrag in.", totaalIncl: 0, totaalExcl: 0, btwTotaal: 0, btwPercentage: w.btwPercentage, btwRegels: null };
  }
  const t = totalenVanRegels(regels);
  if (regels.length === 1) {
    // één regel over: gewoon als enkel tarief opslaan
    return { geldig: true, fout: null, totaalIncl: t.incl, totaalExcl: t.excl, btwTotaal: t.btw, btwPercentage: regels[0].percentage, btwRegels: null };
  }
  return {
    geldig: true,
    fout: null,
    totaalIncl: t.incl,
    totaalExcl: t.excl,
    btwTotaal: t.btw,
    btwPercentage: hoofdPercentage(regels),
    btwRegels: regels,
  };
}
