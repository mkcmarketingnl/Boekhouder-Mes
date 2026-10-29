// Vertaalt de transacties van een periode naar de rubrieken van de Nederlandse BTW-aangifte (omzetbelasting).
// Alles in hele centen. Bewust zonder app-imports (alleen ./btw), zodat het los te testen is.
//
// Wat de app WEL weet: omzet per BTW-tarief (21% / 9% / 0%) en de BTW op kosten.
// Wat de app NIET weet: privégebruik, verleggingsregelingen, export/EU-leveringen, aankopen uit het buitenland
// en de kleineondernemersregeling. Die rubrieken tonen we daarom met € 0 én uitleg wanneer ze voor jou gelden.
import { isVoorbelastingAftrekbaar, naarCenten, naarEuro, regelsVanTransactie, type BtwRegel } from "./btw";

export interface AangifteTransactie {
  id: string;
  type: "kosten" | "omzet";
  leverancier: string;
  factuurnummer: string | null;
  factuurdatum: string;
  categorie: string;
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  btw_percentage: number;
  btw_regels?: BtwRegel[] | null;
}

export interface RubriekBron {
  id: string;
  leverancier: string;
  factuurnummer: string | null;
  factuurdatum: string;
  percentage: number;
  incl: number;
  excl: number;
  btw: number;
}

export interface RubriekBedrag {
  code: string;
  grondslag: number | null; // omzet excl. btw (de "grondslag")
  btw: number | null;
  bronnen: RubriekBron[];
}

export interface Aangifte {
  rubrieken: Record<string, RubriekBedrag>; // 1a, 1b, 1c, 1e
  verschuldigd: number; // 5a
  voorbelasting: number; // 5b
  subtotaal: number; // 5c = 5a - 5b  (positief = te betalen, negatief = terug te vragen)
  nietAftrekbaar: { btw: number; bronnen: RubriekBron[] };
  // de kostenfacturen (per BTW-tarief) waarvan de BTW in de voorbelasting (5b) zit
  voorbelastingBronnen: RubriekBron[];
  // kosten met 0% BTW: bij buitenlandse leveranciers (bijv. software uit de EU/VS) hoort dit mogelijk in 4a/4b
  nulProcentKosten: RubriekBron[];
  aantalOmzetFacturen: number;
  aantalKostenFacturen: number;
}

const leeg = (code: string): RubriekBedrag & { gC: number; bC: number } => ({ code, grondslag: null, btw: null, bronnen: [], gC: 0, bC: 0 });

export function berekenAangifte(transacties: AangifteTransactie[]): Aangifte {
  const r1a = leeg("1a");
  const r1b = leeg("1b");
  const r1c = leeg("1c");
  const r1e = leeg("1e");
  let voorbelastingC = 0;
  let nietAftrekbaarC = 0;
  const nietAftrekbaarBronnen: RubriekBron[] = [];
  const nulKosten: RubriekBron[] = [];
  const voorbelastingBronnen: RubriekBron[] = [];
  let omzetFacturen = 0;
  let kostenFacturen = 0;

  const gesorteerd = [...transacties].sort((a, b) => a.factuurdatum.localeCompare(b.factuurdatum));

  for (const t of gesorteerd) {
    if (t.type === "omzet") omzetFacturen++;
    else kostenFacturen++;

    for (const regel of regelsVanTransactie(t)) {
      const bron: RubriekBron = {
        id: t.id,
        leverancier: t.leverancier,
        factuurnummer: t.factuurnummer,
        factuurdatum: t.factuurdatum,
        percentage: regel.percentage,
        incl: regel.bedrag_incl_btw,
        excl: regel.bedrag_excl_btw,
        btw: regel.btw_bedrag,
      };
      const excl = naarCenten(regel.bedrag_excl_btw);
      const btw = naarCenten(regel.btw_bedrag);

      if (t.type === "omzet") {
        const doel = regel.percentage === 21 ? r1a : regel.percentage === 9 ? r1b : regel.percentage === 0 ? r1e : r1c;
        doel.gC += excl;
        doel.bC += btw;
        doel.bronnen.push(bron);
      } else if (isVoorbelastingAftrekbaar(t)) {
        voorbelastingC += btw;
        voorbelastingBronnen.push(bron);
        if (regel.percentage === 0) nulKosten.push(bron);
      } else {
        nietAftrekbaarC += btw;
        nietAftrekbaarBronnen.push(bron);
      }
    }
  }

  const rubrieken: Record<string, RubriekBedrag> = {};
  for (const r of [r1a, r1b, r1c, r1e]) {
    rubrieken[r.code] = {
      code: r.code,
      grondslag: r.bronnen.length ? naarEuro(r.gC) : null,
      // rubriek 1e kent geen BTW-bedrag (0% / niet bij u belast)
      btw: r.code === "1e" ? null : r.bronnen.length ? naarEuro(r.bC) : null,
      bronnen: r.bronnen,
    };
  }

  const verschuldigdC = r1a.bC + r1b.bC + r1c.bC;
  return {
    rubrieken,
    verschuldigd: naarEuro(verschuldigdC),
    voorbelasting: naarEuro(voorbelastingC),
    subtotaal: naarEuro(verschuldigdC - voorbelastingC),
    nietAftrekbaar: { btw: naarEuro(nietAftrekbaarC), bronnen: nietAftrekbaarBronnen },
    voorbelastingBronnen,
    nulProcentKosten: nulKosten,
    aantalOmzetFacturen: omzetFacturen,
    aantalKostenFacturen: kostenFacturen,
  };
}

// Uiterlijke datum voor aangifte én betaling: einde van de maand na het tijdvak (jaaraangifte: 31 maart).
export function uiterlijkeDatum(type: "maand" | "kwartaal" | "jaar", periodeEinde: Date): Date {
  if (type === "jaar") return new Date(periodeEinde.getFullYear() + 1, 2, 31);
  // laatste dag van de maand NA de maand waarin de periode eindigt
  return new Date(periodeEinde.getFullYear(), periodeEinde.getMonth() + 2, 0);
}
