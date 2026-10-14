import type { SupabaseClient } from "@supabase/supabase-js";
import { isTabelOntbreekt } from "@/lib/facturen";
import { plusMaanden, type GeldDoel, type GeldPost, type GeldUitgave } from "@/lib/geld";

export interface GeldInstellingen {
  inkomen_override_maand: number | null;
  mes_mag_lezen: boolean;
}

export interface UitgaveRij extends GeldUitgave {
  id: string;
  notitie: string | null;
}

export interface GeldGegevens {
  beschikbaar: boolean;
  instellingen: GeldInstellingen;
  posten: GeldPost[];
  uitgaven: UitgaveRij[];
  doelen: GeldDoel[];
}

const num = (v: unknown) => (v == null ? null : Number(v));

// Alleen jouw eigen gegevens (de database dwingt dat ook zelf af). `beschikbaar` is onwaar zolang migratie 0008 ontbreekt.
export async function laadGeld(supabase: SupabaseClient, userId: string, vandaag: string): Promise<GeldGegevens> {
  const leeg: GeldGegevens = { beschikbaar: false, instellingen: { inkomen_override_maand: null, mes_mag_lezen: false }, posten: [], uitgaven: [], doelen: [] };
  // Uitgaven van de afgelopen 4 maanden: genoeg voor de huidige maand en de controle op een patroon
  const vanaf = plusMaanden(`${vandaag.slice(0, 7)}-01`, -3);

  const [inst, posten, uitgaven, doelen] = await Promise.all([
    supabase.from("geld_instellingen").select("inkomen_override_maand, mes_mag_lezen").eq("user_id", userId).maybeSingle(),
    supabase.from("geld_posten").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    supabase.from("geld_uitgaven").select("id, post_id, datum, bedrag, notitie").eq("user_id", userId).gte("datum", vanaf).order("datum", { ascending: false }).limit(1000),
    supabase.from("geld_doelen").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);
  const fouten = [inst.error, posten.error, uitgaven.error, doelen.error].filter(Boolean);
  if (fouten.length > 0) {
    if (!fouten.every((f) => isTabelOntbreekt(f))) console.error("Geld laden mislukt:", fouten.map((f) => f?.message).join("; "));
    return leeg;
  }
  return {
    beschikbaar: true,
    instellingen: { inkomen_override_maand: num(inst.data?.inkomen_override_maand), mes_mag_lezen: !!inst.data?.mes_mag_lezen },
    posten: (posten.data ?? []).map((p) => ({ id: p.id, soort: p.soort, naam: p.naam, bedrag_maand: Number(p.bedrag_maand), restschuld: num(p.restschuld), rente_percentage: num(p.rente_percentage), einddatum: p.einddatum ?? null })),
    uitgaven: (uitgaven.data ?? []).map((u) => ({ id: u.id, post_id: u.post_id, datum: u.datum, bedrag: Number(u.bedrag), notitie: u.notitie ?? null })),
    doelen: (doelen.data ?? []).map((d) => ({ id: d.id, naam: d.naam, soort: d.soort, doel_bedrag: num(d.doel_bedrag), huidig_bedrag: Number(d.huidig_bedrag), streefdatum: d.streefdatum ?? null })),
  };
}
