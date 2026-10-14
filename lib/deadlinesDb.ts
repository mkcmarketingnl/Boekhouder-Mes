import type { SupabaseClient } from "@supabase/supabase-js";
import { berekenMeldingen, laatsteBtwTijdvak, type Melding, type Tijdvak } from "@/lib/deadlines";
import { openstaand } from "@/lib/betaling";
import { urencriteriumStand } from "@/lib/uren";
import { laadJaarMinuten } from "@/lib/urenDb";

function minDagen(datum: string, dagen: number): string {
  const [j, m, d] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, d - dagen)).toISOString().slice(0, 10);
}

// Verzamelt wat de meldingen nodig hebben. Elk onderdeel faalt stil: ontbreekt een tabel (migratie 0008 nog niet gedraaid),
// dan blijft die melding gewoon weg en werkt de rest.
export async function laadMeldingen(supabase: SupabaseClient, userId: string, tijdvak: Tijdvak, vandaag: string): Promise<Melding[]> {
  const jaar = Number(vandaag.slice(0, 4));
  const t = laatsteBtwTijdvak(tijdvak, vandaag);

  const [btw, facturen, uren, oudeUren] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("factuurdatum", t.begin).lte("factuurdatum", t.einde),
    (async () => {
      const metBetaling = await supabase.from("sales_invoices").select("status, vervaldatum, totaal_incl, betaald_op").eq("user_id", userId).eq("status", "definitief");
      return metBetaling.error ? null : metBetaling.data;
    })(),
    laadJaarMinuten(supabase, userId, jaar),
    supabase.from("time_entries").select("minuten").eq("user_id", userId).eq("factureerbaar", true).is("invoice_id", null).lte("datum", minDagen(vandaag, 14)).limit(1000),
  ]);

  const open = openstaand((facturen ?? []).map((f) => ({ status: f.status, vervaldatum: f.vervaldatum, totaal_incl: Number(f.totaal_incl), betaald_op: f.betaald_op })), vandaag);
  const stand = uren.beschikbaar && uren.minuten > 0 ? urencriteriumStand(uren.minuten, vandaag) : null;
  const oudeMinuten = oudeUren.error ? 0 : (oudeUren.data ?? []).reduce((a, r) => a + Number(r.minuten), 0);

  return berekenMeldingen({
    vandaag,
    tijdvak,
    heeftBtwAdministratie: !btw.error && (btw.count ?? 0) > 0,
    teLaatAantal: open.aantalTeLaat,
    teLaatBedrag: open.bedragTeLaat,
    uren: stand ? { gewerktUren: stand.gewerktUren, prognoseUren: stand.prognoseUren, opKoers: stand.opKoers } : null,
    oudeOpenUren: oudeMinuten / 60,
  });
}
