"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { isTabelOntbreekt } from "@/lib/facturen";
import { klantRij, type KlantInvoer } from "@/lib/klantenDb";

const MIGRATIE_KLANTEN = "Het bewaren van klanten heeft een eenmalige database-update nodig (migratie 0007_klanten.sql in Supabase).";

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { hasAccess } = await getAccessStatus(user.id);
  return hasAccess ? { supabase, user } : null;
}

export async function bewaarKlant(invoer: KlantInvoer, id?: string): Promise<{ fout: string | null; id?: string }> {
  const ctx = await context();
  if (!ctx) return { fout: "Geen actief abonnement." };
  if (!invoer.naam.trim()) return { fout: "Vul de naam van de klant in." };
  const rij = klantRij(invoer);

  if (id) {
    const { data, error } = await ctx.supabase.from("invoice_customers").update(rij).eq("id", id).eq("user_id", ctx.user.id).select("id");
    if (error) return { fout: isTabelOntbreekt(error) ? MIGRATIE_KLANTEN : error.code === "23505" ? "Je hebt al een klant met deze naam." : "Opslaan is mislukt." };
    if (!data || data.length === 0) return { fout: "Klant niet gevonden." };
    revalidatePath("/facturen", "layout");
    return { fout: null, id };
  }
  const { data, error } = await ctx.supabase.from("invoice_customers").insert({ ...rij, user_id: ctx.user.id }).select("id").single();
  if (error || !data) return { fout: isTabelOntbreekt(error) ? MIGRATIE_KLANTEN : error?.code === "23505" ? "Je hebt al een klant met deze naam." : "Opslaan is mislukt." };
  revalidatePath("/facturen", "layout");
  return { fout: null, id: data.id };
}

// Bestaande facturen blijven ongewijzigd: elke factuur bewaart zelf de klantgegevens zoals ze erop stonden.
export async function verwijderKlant(id: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return { fout: "Geen actief abonnement." };
  const { error } = await ctx.supabase.from("invoice_customers").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) return { fout: isTabelOntbreekt(error) ? MIGRATIE_KLANTEN : "Verwijderen is mislukt." };
  revalidatePath("/facturen", "layout");
  return { fout: null };
}
