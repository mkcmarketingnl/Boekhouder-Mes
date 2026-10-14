import type { SupabaseClient } from "@supabase/supabase-js";
import { isTabelOntbreekt } from "@/lib/facturen";
import type { IbAntwoorden } from "@/lib/belasting";
import { estimateIncomeTax, type TaxEstimate } from "@/lib/tax";
import type { Rechtsvorm } from "@/lib/types";

// Leest alleen waarden die we kennen en van het juiste type; alles wat in de database staat is data, geen vertrouwen.
export function schoonAntwoorden(ruw: unknown): IbAntwoorden {
  const o = (ruw && typeof ruw === "object" ? ruw : {}) as Record<string, unknown>;
  const ja = (v: unknown) => (typeof v === "boolean" ? v : null);
  const getal = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : null);
  const uit: IbAntwoorden = {};
  const urencriterium = ja(o.urencriterium);
  if ("urencriterium" in o) uit.urencriterium = urencriterium;
  if ("starter" in o) uit.starter = ja(o.starter);
  if ("starterEerderGebruikt" in o) uit.starterEerderGebruikt = getal(o.starterEerderGebruikt, 3);
  if ("kiaInvestering" in o) uit.kiaInvestering = getal(o.kiaInvestering, 10_000_000);
  if ("aovPremie" in o) uit.aovPremie = getal(o.aovPremie, 1_000_000);
  if ("pensioenPremie" in o) uit.pensioenPremie = getal(o.pensioenPremie, 1_000_000);
  if ("vofAandeel" in o) uit.vofAandeel = getal(o.vofAandeel, 100);
  return uit;
}

// `beschikbaar` is onwaar zolang migratie 0008 niet is uitgevoerd; dan rekent alles met de standaardaannames.
export async function laadIbAntwoorden(supabase: SupabaseClient, userId: string, jaar: number): Promise<{ beschikbaar: boolean; antwoorden: IbAntwoorden | null }> {
  const { data, error } = await supabase.from("ib_antwoorden").select("antwoorden").eq("user_id", userId).eq("jaar", jaar).maybeSingle();
  if (error) {
    if (!isTabelOntbreekt(error)) console.error("Belastingantwoorden laden mislukt:", error.message);
    return { beschikbaar: false, antwoorden: null };
  }
  return { beschikbaar: true, antwoorden: data ? schoonAntwoorden(data.antwoorden) : null };
}

// Eén plek voor "hoeveel belasting reserveer ik": dashboard, chat en tips gebruiken allemaal deze functie.
export async function schatBelasting(supabase: SupabaseClient, userId: string, rechtsvorm: Rechtsvorm, winst: number, jaar: number): Promise<TaxEstimate> {
  const { antwoorden } = await laadIbAntwoorden(supabase, userId, jaar);
  return estimateIncomeTax(rechtsvorm, winst, antwoorden, jaar);
}
