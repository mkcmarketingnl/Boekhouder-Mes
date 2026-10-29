// Snelle controles zonder scan: dingen die je direct aan je opgeslagen boekingen kunt zien. Bewust zonder app-imports,
// zodat het los te testen is. Dit zijn aanwijzingen om na te kijken, geen vaststaande fouten.

export interface SnelleTx {
  id: string;
  type: "kosten" | "omzet";
  leverancier: string;
  factuurnummer: string | null;
  factuurdatum: string;
  bedrag_incl_btw: number;
  categorie: string;
  btw_percentage: number;
  heeftBtwRegels: boolean;
  invoerwijze: "ai" | "handmatig";
  document_id: string | null;
  ingehouden_op?: string | null;
}

export interface DubbelGroep {
  reden: "nummer" | "bedrag";
  leverancier: string;
  txs: SnelleTx[];
}

export interface SnelleUitkomst {
  dubbel: DubbelGroep[];
  // Een restaurant- of horecabon met maar één BTW-tarief: waarschijnlijk staan er 9% (eten) én 21% (drank) op
  horecaEenTarief: SnelleTx[];
  // Handmatig ingevoerd: er is geen document om opnieuw te scannen
  handmatig: SnelleTx[];
}

const naam = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const nummer = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function snelleControles(txs: SnelleTx[]): SnelleUitkomst {
  // ingehouden kosten (factoring e.d.) horen bij hun factuur en tellen hier niet mee
  const eigen = txs.filter((t) => !t.ingehouden_op);

  const dubbel: DubbelGroep[] = [];
  const perNummer = new Map<string, SnelleTx[]>();
  for (const t of eigen) {
    const n = nummer(t.factuurnummer);
    if (!n) continue;
    const sleutel = `${t.type}|${naam(t.leverancier)}|${n}`;
    perNummer.set(sleutel, [...(perNummer.get(sleutel) ?? []), t]);
  }
  const alInGroep = new Set<string>();
  for (const groep of perNummer.values()) {
    if (groep.length < 2) continue;
    dubbel.push({ reden: "nummer", leverancier: groep[0].leverancier, txs: groep });
    for (const t of groep) alInGroep.add(t.id);
  }
  // Zonder factuurnummer: zelfde partij, datum en bedrag
  const perBedrag = new Map<string, SnelleTx[]>();
  for (const t of eigen) {
    if (nummer(t.factuurnummer) || alInGroep.has(t.id)) continue;
    const sleutel = `${t.type}|${naam(t.leverancier)}|${t.factuurdatum}|${Math.round(t.bedrag_incl_btw * 100)}`;
    perBedrag.set(sleutel, [...(perBedrag.get(sleutel) ?? []), t]);
  }
  for (const groep of perBedrag.values()) if (groep.length >= 2) dubbel.push({ reden: "bedrag", leverancier: groep[0].leverancier, txs: groep });

  return {
    dubbel,
    horecaEenTarief: eigen.filter((t) => t.type === "kosten" && t.categorie === "Horeca/representatie" && !t.heeftBtwRegels),
    handmatig: eigen.filter((t) => t.invoerwijze === "handmatig" || !t.document_id),
  };
}
