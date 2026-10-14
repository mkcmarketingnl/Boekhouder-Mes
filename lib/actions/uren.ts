"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { bewaarFactuur, verwijderConcept } from "@/lib/actions/facturen";
import { isTabelOntbreekt, plusDagen, vandaagNl, type InvoiceSettings } from "@/lib/facturen";
import { MAX_MINUTEN_PER_REGEL, parseDuur, urenNaarFactuurRegels, type UrenRegel } from "@/lib/uren";

const MIGRATIE = "Urenregistratie heeft een eenmalige database-update nodig (migratie 0008_uren_belasting_geld.sql in Supabase).";

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { hasAccess } = await getAccessStatus(user.id);
  return hasAccess ? { supabase, user } : null;
}

export interface UrenInvoer {
  datum: string;
  klant_naam: string;
  project: string;
  omschrijving: string;
  duur: string; // zoals getypt: "3,5" of "3:30"
  factureerbaar: boolean;
  uurtarief: number | null;
}

const schoon = (s: string) => (s ?? "").trim() || null;

export async function bewaarUren(invoer: UrenInvoer, id?: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return { fout: "Geen actief abonnement." };

  const klant = invoer.klant_naam.trim();
  if (!klant) return { fout: "Vul in voor welke klant je gewerkt hebt." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoer.datum)) return { fout: "Vul een geldige datum in." };
  const minuten = parseDuur(invoer.duur);
  if (minuten === null) return { fout: "Die duur snap ik niet. Typ bijvoorbeeld 3,5 of 3:30 (maximaal 24 uur per regel)." };
  if (minuten <= 0) return { fout: "Vul de duur in, bijvoorbeeld 3,5 of 3:30." };
  if (minuten > MAX_MINUTEN_PER_REGEL) return { fout: "Een urenregel kan niet langer zijn dan 24 uur." };
  const tarief = invoer.uurtarief == null || !Number.isFinite(Number(invoer.uurtarief)) ? null : Math.max(0, Math.round(Number(invoer.uurtarief) * 100) / 100);

  const rij = {
    datum: invoer.datum,
    klant_naam: klant,
    project: schoon(invoer.project),
    omschrijving: schoon(invoer.omschrijving)?.slice(0, 300) ?? null,
    minuten,
    factureerbaar: !!invoer.factureerbaar,
    uurtarief: invoer.factureerbaar ? tarief : null,
  };

  if (id) {
    const { data, error } = await ctx.supabase.from("time_entries").update(rij).eq("id", id).eq("user_id", ctx.user.id).is("invoice_id", null).select("id");
    if (error) return { fout: isTabelOntbreekt(error) ? MIGRATIE : "Opslaan is mislukt." };
    if (!data || data.length === 0) return { fout: "Deze uren staan al op een factuur en kunnen niet meer worden gewijzigd." };
  } else {
    const { error } = await ctx.supabase.from("time_entries").insert({ ...rij, user_id: ctx.user.id });
    if (error) return { fout: isTabelOntbreekt(error) ? MIGRATIE : "Opslaan is mislukt." };
  }
  revalidatePath("/uren");
  return { fout: null };
}

export async function verwijderUren(id: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return { fout: "Geen actief abonnement." };
  const { data, error } = await ctx.supabase.from("time_entries").delete().eq("id", id).eq("user_id", ctx.user.id).is("invoice_id", null).select("id");
  if (error) return { fout: isTabelOntbreekt(error) ? MIGRATIE : "Verwijderen is mislukt." };
  if (!data || data.length === 0) return { fout: "Uren die op een factuur staan kun je niet verwijderen." };
  revalidatePath("/uren");
  return { fout: null };
}

// Maakt van de gekozen, nog niet gefactureerde uren van één klant een factuurconcept en vergrendelt die uren.
// Alles-of-niets: lukt het koppelen niet voor alle uren, dan verdwijnt het concept weer en blijft alles zoals het was.
export async function maakFactuurUitUren(klantNaam: string, ids: string[]): Promise<{ fout: string | null; id?: string }> {
  const ctx = await context();
  if (!ctx) return { fout: "Geen actief abonnement." };
  const uniek = [...new Set(ids)];
  if (uniek.length === 0) return { fout: "Kies eerst de uren die je wilt factureren." };
  if (uniek.length > 500) return { fout: "Kies maximaal 500 urenregels per factuur." };

  const { data: rijen, error } = await ctx.supabase.from("time_entries").select("*").eq("user_id", ctx.user.id).in("id", uniek);
  if (error) return { fout: isTabelOntbreekt(error) ? MIGRATIE : "Uren ophalen is mislukt." };
  const uren = (rijen ?? []) as UrenRegel[];
  if (uren.length !== uniek.length) return { fout: "Een deel van de gekozen uren bestaat niet meer. Ververs de pagina en probeer opnieuw." };
  if (uren.some((u) => u.invoice_id)) return { fout: "Een deel van de gekozen uren staat al op een factuur." };
  if (uren.some((u) => !u.factureerbaar)) return { fout: "Alleen factureerbare uren kunnen op een factuur." };
  const sleutel = klantNaam.trim().toLowerCase();
  if (uren.some((u) => u.klant_naam.trim().toLowerCase() !== sleutel)) return { fout: "Kies uren van één klant per factuur." };

  const { regels, zonderTarief } = urenNaarFactuurRegels(uren, 21);
  if (zonderTarief.length > 0) return { fout: `Bij ${zonderTarief.length} urenregel${zonderTarief.length === 1 ? "" : "s"} staat geen uurtarief. Vul dat eerst in.` };
  if (regels.length === 0) return { fout: "Er zijn geen uren om te factureren." };

  const [{ data: settingsRij }, klantRes] = await Promise.all([
    ctx.supabase.from("invoice_settings").select("*").eq("user_id", ctx.user.id).maybeSingle(),
    ctx.supabase.from("invoice_customers").select("naam, adres, postcode, plaats, land, btw_nummer, kvk, email").eq("user_id", ctx.user.id),
  ]);
  const settings = settingsRij as InvoiceSettings | null;
  if (!settings) return { fout: "Vul eerst je factuurinstellingen in (Facturen → Instellingen)." };
  const bekend = (klantRes.data ?? []).find((k: { naam: string }) => k.naam.trim().toLowerCase() === sleutel) as
    | { naam: string; adres: string | null; postcode: string | null; plaats: string | null; land: string; btw_nummer: string | null; kvk: string | null; email: string | null }
    | undefined;

  const vandaag = vandaagNl();
  const aangemaakt = await bewaarFactuur({
    klant_naam: bekend?.naam ?? klantNaam.trim(),
    klant_adres: bekend?.adres ?? "",
    klant_postcode: bekend?.postcode ?? "",
    klant_plaats: bekend?.plaats ?? "",
    klant_land: bekend?.land ?? "Nederland",
    klant_btw_nummer: bekend?.btw_nummer ?? "",
    klant_kvk: bekend?.kvk ?? "",
    klant_email: bekend?.email ?? "",
    factuurdatum: vandaag,
    vervaldatum: plusDagen(vandaag, settings.betaaltermijn_dagen),
    leverdatum: "",
    regels: regels.map((r) => ({ omschrijving: r.omschrijving, toelichting: r.toelichting, aantal: r.aantal, prijs_excl: r.prijs_excl, btw_percentage: r.btw_percentage })),
    btw_verlegd: false,
    notitie: settings.standaard_notitie ?? "",
    template: settings.standaard_template,
    klant_bewaren: false,
  });
  if (aangemaakt.fout || !aangemaakt.data) return { fout: aangemaakt.fout ?? "Het factuurconcept maken is mislukt." };
  const factuurId = aangemaakt.data.id;

  // Alleen uren die nog vrij zijn worden gekoppeld; het aantal moet exact kloppen.
  const { data: gekoppeld, error: koppelFout } = await ctx.supabase
    .from("time_entries")
    .update({ invoice_id: factuurId })
    .in("id", uniek)
    .eq("user_id", ctx.user.id)
    .is("invoice_id", null)
    .select("id");
  if (koppelFout || !gekoppeld || gekoppeld.length !== uniek.length) {
    await ctx.supabase.from("time_entries").update({ invoice_id: null }).eq("invoice_id", factuurId).eq("user_id", ctx.user.id);
    await verwijderConcept(factuurId);
    return { fout: "De uren konden niet allemaal aan de factuur worden gekoppeld (misschien is er net iets gewijzigd). Er is niets veranderd; probeer het opnieuw." };
  }

  revalidatePath("/uren");
  revalidatePath("/facturen", "layout");
  return { fout: null, id: factuurId };
}
