import type { SupabaseClient } from "@supabase/supabase-js";
import { isTabelOntbreekt, type InvoiceSettings } from "@/lib/facturen";

export interface FactuurProfiel {
  bedrijfsnaam: string;
  kvk_nummer: string | null;
  btw_nummer: string | null;
}

export interface FactuurContext {
  tabelOntbreekt: boolean;
  settings: InvoiceSettings | null;
  profiel: FactuurProfiel;
  vorigNummer: string | null;
}

// Alles wat de factuurpagina's gemeen hebben: instellingen, bedrijfsprofiel en het laatst gebruikte factuurnummer.
// `tabelOntbreekt` is waar zolang migratie 0005 nog niet is uitgevoerd; de pagina's tonen dan een uitleg i.p.v. een crash.
export async function laadFactuurContext(supabase: SupabaseClient, userId: string, negeerId?: string): Promise<FactuurContext> {
  const [settingsRes, profielRes] = await Promise.all([
    supabase.from("invoice_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("bedrijfsnaam, kvk_nummer, btw_nummer").eq("user_id", userId).single(),
  ]);
  const profiel = (profielRes.data ?? { bedrijfsnaam: "", kvk_nummer: null, btw_nummer: null }) as FactuurProfiel;
  if (isTabelOntbreekt(settingsRes.error)) return { tabelOntbreekt: true, settings: null, profiel, vorigNummer: null };

  let query = supabase.from("sales_invoices").select("factuurnummer").eq("user_id", userId).eq("status", "definitief").order("created_at", { ascending: false }).limit(1);
  if (negeerId) query = query.neq("id", negeerId);
  const { data: vorige } = await query;

  return { tabelOntbreekt: false, settings: (settingsRes.data as InvoiceSettings | null) ?? null, profiel, vorigNummer: vorige?.[0]?.factuurnummer ?? null };
}
