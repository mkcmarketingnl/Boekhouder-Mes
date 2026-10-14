import type { SupabaseClient } from "@supabase/supabase-js";
import { isTabelOntbreekt } from "@/lib/facturen";

// Opgeslagen klanten voor de factuurmaker (tabel invoice_customers, migratie 0007).
export interface Klant {
  id: string;
  naam: string;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string;
  btw_nummer: string | null;
  kvk: string | null;
  email: string | null;
  // Alleen aanwezig als migratie 0008 is uitgevoerd
  uurtarief?: number | null;
}

export interface KlantInvoer {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  land: string;
  btw_nummer: string;
  kvk: string;
  email: string;
  // undefined = niet aanraken (kolom bestaat nog niet)
  uurtarief?: number | null;
}

const KOLOMMEN = "id, naam, adres, postcode, plaats, land, btw_nummer, kvk, email";
const KOLOMMEN_MET_TARIEF = KOLOMMEN + ", uurtarief";
const schoon = (s: string | null | undefined) => (s ?? "").trim() || null;

export function klantRij(i: KlantInvoer) {
  return {
    naam: i.naam.trim(),
    adres: schoon(i.adres),
    postcode: schoon(i.postcode),
    plaats: schoon(i.plaats),
    land: schoon(i.land) ?? "Nederland",
    btw_nummer: schoon(i.btw_nummer)?.replace(/[\s.]/g, "").toUpperCase() ?? null,
    kvk: schoon(i.kvk),
    email: schoon(i.email),
    ...(i.uurtarief !== undefined ? { uurtarief: i.uurtarief == null || !Number.isFinite(Number(i.uurtarief)) ? null : Math.max(0, Number(i.uurtarief)) } : {}),
  };
}

// `beschikbaar` is onwaar zolang migratie 0007 niet is uitgevoerd; de factuurmaker werkt dan gewoon zonder klantenlijst.
export async function laadKlanten(supabase: SupabaseClient, userId: string): Promise<{ beschikbaar: boolean; klanten: Klant[] }> {
  let { data, error } = await supabase.from("invoice_customers").select(KOLOMMEN_MET_TARIEF as "*").eq("user_id", userId).order("naam", { ascending: true });
  if (error && /uurtarief/i.test(error.message)) {
    // migratie 0008 nog niet uitgevoerd: zonder uurtarief verder
    ({ data, error } = await supabase.from("invoice_customers").select(KOLOMMEN as "*").eq("user_id", userId).order("naam", { ascending: true }));
  }
  if (error) {
    if (!isTabelOntbreekt(error)) console.error("Klanten laden mislukt:", error.message);
    return { beschikbaar: false, klanten: [] };
  }
  return { beschikbaar: true, klanten: (data ?? []) as unknown as Klant[] };
}

// Bewaart (of ververst) de klant van een factuur op naam. Faalt nooit hard: de factuur gaat voor.
export async function bewaarKlantUitFactuur(supabase: SupabaseClient, userId: string, invoer: KlantInvoer): Promise<void> {
  const naam = invoer.naam.trim();
  if (!naam) return;
  const { data, error } = await supabase.from("invoice_customers").select("id, naam").eq("user_id", userId);
  if (error) return;
  const bestaand = (data ?? []).find((k: { id: string; naam: string }) => k.naam.trim().toLowerCase() === naam.toLowerCase());
  if (bestaand) await supabase.from("invoice_customers").update(klantRij(invoer)).eq("id", bestaand.id).eq("user_id", userId);
  else await supabase.from("invoice_customers").insert({ ...klantRij(invoer), user_id: userId });
}
