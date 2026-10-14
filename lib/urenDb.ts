import type { SupabaseClient } from "@supabase/supabase-js";
import { isTabelOntbreekt } from "@/lib/facturen";
import type { UrenRegel } from "@/lib/uren";

const SELECT = "id, datum, klant_naam, project, omschrijving, minuten, factureerbaar, uurtarief, invoice_id";
const PAGINA = 1000; // PostgREST geeft standaard maximaal 1000 rijen per verzoek

export interface UrenGegevens {
  beschikbaar: boolean;
  periode: UrenRegel[];
  openUren: UrenRegel[];
  jaarMinuten: number;
  jaarFactureerbaarMinuten: number;
}

const naarRegels = (rijen: unknown[] | null): UrenRegel[] =>
  ((rijen ?? []) as UrenRegel[]).map((r) => ({ ...r, uurtarief: r.uurtarief == null ? null : Number(r.uurtarief) }));

// Haalt alle rijen op, 1000 tegelijk. Zo klopt een jaartotaal ook als je meer dan 1000 urenregels hebt.
async function alles<T>(haal: (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<{ rijen: T[]; fout: { code?: string; message?: string } | null }> {
  const rijen: T[] = [];
  for (let van = 0; van < 50000; van += PAGINA) {
    const { data, error } = await haal(van, van + PAGINA - 1);
    if (error) return { rijen, fout: error };
    rijen.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return { rijen, fout: null };
}

export async function laadUren(supabase: SupabaseClient, userId: string, vanDatum: string, totDatum: string, jaar: number): Promise<UrenGegevens> {
  const leeg: UrenGegevens = { beschikbaar: false, periode: [], openUren: [], jaarMinuten: 0, jaarFactureerbaarMinuten: 0 };
  const periodeRes = await alles<unknown>((van, tot) =>
    supabase.from("time_entries").select(SELECT).eq("user_id", userId).gte("datum", vanDatum).lte("datum", totDatum).order("datum", { ascending: false }).order("created_at", { ascending: false }).range(van, tot)
  );
  if (periodeRes.fout) {
    if (!isTabelOntbreekt(periodeRes.fout)) console.error("Uren laden mislukt:", periodeRes.fout.message);
    return leeg;
  }
  const openRes = await alles<unknown>((van, tot) =>
    supabase.from("time_entries").select(SELECT).eq("user_id", userId).eq("factureerbaar", true).is("invoice_id", null).order("datum", { ascending: true }).range(van, tot)
  );
  const jaarRes = await alles<{ minuten: number; factureerbaar: boolean }>((van, tot) =>
    supabase.from("time_entries").select("minuten, factureerbaar").eq("user_id", userId).gte("datum", `${jaar}-01-01`).lte("datum", `${jaar}-12-31`).range(van, tot)
  );
  return {
    beschikbaar: true,
    periode: naarRegels(periodeRes.rijen),
    openUren: naarRegels(openRes.rijen),
    jaarMinuten: jaarRes.rijen.reduce((a, r) => a + r.minuten, 0),
    jaarFactureerbaarMinuten: jaarRes.rijen.filter((r) => r.factureerbaar).reduce((a, r) => a + r.minuten, 0),
  };
}

// Alleen het jaartotaal aan uren (voor het urencriterium); `beschikbaar` is onwaar zolang migratie 0008 ontbreekt.
export async function laadJaarMinuten(supabase: SupabaseClient, userId: string, jaar: number): Promise<{ beschikbaar: boolean; minuten: number }> {
  const res = await alles<{ minuten: number }>((van, tot) =>
    supabase.from("time_entries").select("minuten").eq("user_id", userId).gte("datum", `${jaar}-01-01`).lte("datum", `${jaar}-12-31`).range(van, tot)
  );
  if (res.fout) return { beschikbaar: false, minuten: 0 };
  return { beschikbaar: true, minuten: res.rijen.reduce((a, r) => a + r.minuten, 0) };
}

// Totaal en factureerbaar deel van de uren in een jaar (voor het jaaroverzicht).
export async function laadJaarUrenSplit(supabase: SupabaseClient, userId: string, jaar: number): Promise<{ beschikbaar: boolean; totaalMinuten: number; factureerbaarMinuten: number }> {
  const res = await alles<{ minuten: number; factureerbaar: boolean }>((van, tot) =>
    supabase.from("time_entries").select("minuten, factureerbaar").eq("user_id", userId).gte("datum", `${jaar}-01-01`).lte("datum", `${jaar}-12-31`).range(van, tot)
  );
  if (res.fout) return { beschikbaar: false, totaalMinuten: 0, factureerbaarMinuten: 0 };
  return {
    beschikbaar: true,
    totaalMinuten: res.rijen.reduce((a, r) => a + r.minuten, 0),
    factureerbaarMinuten: res.rijen.filter((r) => r.factureerbaar).reduce((a, r) => a + r.minuten, 0),
  };
}
