import type { SupabaseClient } from "@supabase/supabase-js";
import { berekenIb } from "@/lib/belasting";
import { laadIbAntwoorden } from "@/lib/belastingDb";
import { inkomenUitBoekhouding, maandOverzicht, type GeldDoel, type GeldPost, type GeldVerplichting } from "@/lib/geld";
import type { Rechtsvorm } from "@/lib/types";

export interface GeldInkomen {
  perMaand: number;
  betrouwbaar: boolean;
  uitleg: string;
}

// Je netto inkomen per maand uit je boekhouding (null bij een BV of "anders": daar is winst geen inkomen en vul je het zelf in).
// Gebruikt dezelfde belastingberekening als het dashboard en de inkomstenbelasting-modus.
export async function inkomenUitAdministratie(supabase: SupabaseClient, userId: string, rechtsvorm: Rechtsvorm, winstTotNu: number, dagenVoorbij: number, jaar: number): Promise<GeldInkomen | null> {
  if (rechtsvorm !== "eenmanszaak" && rechtsvorm !== "vof") return null;
  const { antwoorden } = await laadIbAntwoorden(supabase, userId, jaar);
  const aandeel = rechtsvorm === "vof" ? Math.min(100, Math.max(0, antwoorden?.vofAandeel ?? 100)) / 100 : 1;
  const auto = inkomenUitBoekhouding(winstTotNu * aandeel, dagenVoorbij, (w) => berekenIb({ winst: w, antwoorden: antwoorden ?? {}, jaar }).totaal);
  return { perMaand: auto.perMaand, betrouwbaar: auto.betrouwbaar, uitleg: "inkomstenbelasting en Zvw" };
}

export function dagenVoorbijInJaar(vandaag: string): number {
  const [j, m, d] = vandaag.split("-").map(Number);
  return Math.max(1, Math.round((Date.UTC(j, m - 1, d) - Date.UTC(j, 0, 1)) / 86400000) + 1);
}

// Korte tekst voor Mes, alleen als de gebruiker dat heeft aangezet. Geen uitgavenlijst, alleen de samenvatting.
export function geldContextVoorMes(inkomen: number, posten: GeldPost[], doelen: GeldDoel[], verplichtingen: GeldVerplichting[] = []): string {
  const o = maandOverzicht(inkomen, posten);
  const eur = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const lijst = (soort: GeldPost["soort"]) =>
    posten
      .filter((p) => p.soort === soort)
      .map((p) => `${p.naam} ${eur(p.bedrag_maand)}${soort === "schuld" && p.restschuld ? ` (nog ${eur(p.restschuld)}${p.rente_percentage ? `, ${p.rente_percentage}% rente` : ""})` : ""}`)
      .join(", ");
  const regels = [
    `- Privé-financiën (de gebruiker deelt dit bewust met jou): netto inkomen ongeveer ${eur(o.inkomen)} per maand, vaste lasten ${eur(o.vasteLasten)}${lijst("vaste_last") ? ` (${lijst("vaste_last")})` : ""}, aflossingen ${eur(o.aflossingen)}${lijst("schuld") ? ` (${lijst("schuld")})` : ""}, speelruimte ${eur(o.speelruimte)}${lijst("speelruimte") ? ` (${lijst("speelruimte")})` : ""}. Over voor doelen en buffer: ${eur(o.voorDoelen)} per maand.`,
  ];
  const d = doelen.filter((x) => x.soort !== "overzicht" && (x.doel_bedrag ?? 0) > 0);
  if (d.length > 0) regels.push(`- Financiële doelen: ${d.map((x) => `${x.naam} (${eur(x.huidig_bedrag)} van ${eur(x.doel_bedrag ?? 0)}${x.streefdatum ? `, streefdatum ${x.streefdatum}` : ""})`).join("; ")}.`);
  const open = verplichtingen.filter((v) => !v.betaald_op);
  if (open.length > 0) regels.push(`- Openstaande verplichtingen met een deadline: ${open.map((v) => `${v.naam} ${eur(v.bedrag)} uiterlijk ${v.deadline}${v.instantie ? ` (${v.instantie})` : ""}`).join("; ")}.`);
  const overzicht = doelen.filter((x) => x.soort === "overzicht").map((x) => x.naam);
  if (overzicht.length > 0) regels.push(`- Wil meer grip op geld: ${overzicht.join("; ")}.`);
  regels.push("- Behandel deze gegevens vertrouwelijk, oordeel niet over keuzes zoals casino of uit eten, en geef geen beleggingsadvies.");
  return regels.join("\n");
}
