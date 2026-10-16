"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { isTabelOntbreekt } from "@/lib/facturen";

const MIGRATIE = "Money mode heeft een eenmalige database-update nodig (migratie 0008_uren_belasting_geld.sql in Supabase).";
const MAX_BEDRAG = 10_000_000;

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { hasAccess } = await getAccessStatus(user.id);
  return hasAccess ? { supabase, user } : null;
}

const GEEN_TOEGANG = { fout: "Geen actief abonnement." };
const fout = (error: { code?: string; message?: string } | null, standaard: string) => (isTabelOntbreekt(error) ? MIGRATIE : standaard);
const isDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

// Een bedrag van de gebruiker: een getal van 0 tot 10 miljoen, op centen afgerond. Alles anders wordt geweigerd.
function bedrag(n: unknown, min = 0): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > MAX_BEDRAG) return null;
  return Math.round(n * 100) / 100;
}

function opgeslagen() {
  revalidatePath("/geld");
}

// ---------- posten (vaste lasten, schulden, speelruimte) ----------

export interface PostInvoer {
  soort: "vaste_last" | "schuld" | "speelruimte";
  naam: string;
  bedrag_maand: number;
  restschuld?: number | null;
  rente_percentage?: number | null;
  einddatum?: string | null;
}

export async function bewaarPost(invoer: PostInvoer, id?: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  if (!["vaste_last", "schuld", "speelruimte"].includes(invoer.soort)) return { fout: "Onbekend soort." };
  const naam = (invoer.naam ?? "").trim().slice(0, 80);
  if (!naam) return { fout: "Geef het een naam." };
  const maand = bedrag(invoer.bedrag_maand);
  if (maand === null) return { fout: "Vul een geldig maandbedrag in." };

  const rij: Record<string, unknown> = { soort: invoer.soort, naam, bedrag_maand: maand, restschuld: null, rente_percentage: null, einddatum: null };
  if (invoer.soort === "schuld") {
    const rest = invoer.restschuld == null ? null : bedrag(invoer.restschuld);
    if (invoer.restschuld != null && rest === null) return { fout: "Vul een geldig openstaand bedrag in." };
    const rente = invoer.rente_percentage == null ? null : bedrag(invoer.rente_percentage);
    if (invoer.rente_percentage != null && (rente === null || rente > 100)) return { fout: "Vul een rente tussen 0 en 100% in." };
    if (invoer.einddatum && !isDatum(invoer.einddatum)) return { fout: "Vul een geldige einddatum in." };
    rij.restschuld = rest;
    rij.rente_percentage = rente;
    rij.einddatum = invoer.einddatum || null;
  }

  if (id) {
    const { data, error } = await ctx.supabase.from("geld_posten").update(rij).eq("id", id).eq("user_id", ctx.user.id).select("id");
    if (error) return { fout: fout(error, "Opslaan is mislukt.") };
    if (!data || data.length === 0) return { fout: "Niet gevonden." };
  } else {
    const { error } = await ctx.supabase.from("geld_posten").insert({ ...rij, user_id: ctx.user.id });
    if (error) return { fout: fout(error, "Opslaan is mislukt.") };
  }
  opgeslagen();
  return { fout: null };
}

export async function verwijderPost(id: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const { error } = await ctx.supabase.from("geld_posten").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) return { fout: fout(error, "Verwijderen is mislukt.") };
  opgeslagen();
  return { fout: null };
}

// ---------- uitgaven binnen je speelruimte ----------

export async function voegUitgaveToe(invoer: { post_id: string; datum: string; bedrag: number; notitie?: string }): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const b = bedrag(invoer.bedrag, 0.01);
  if (b === null) return { fout: "Vul een geldig bedrag in." };
  if (!isDatum(invoer.datum)) return { fout: "Vul een geldige datum in." };
  const { data: post, error: postFout } = await ctx.supabase.from("geld_posten").select("id, soort").eq("id", invoer.post_id).eq("user_id", ctx.user.id).maybeSingle();
  if (postFout) return { fout: fout(postFout, "Opslaan is mislukt.") };
  if (!post || post.soort !== "speelruimte") return { fout: "Kies een post uit je speelruimte." };
  const { error } = await ctx.supabase.from("geld_uitgaven").insert({ user_id: ctx.user.id, post_id: post.id, datum: invoer.datum, bedrag: b, notitie: (invoer.notitie ?? "").trim().slice(0, 200) || null });
  if (error) return { fout: fout(error, "Opslaan is mislukt.") };
  opgeslagen();
  return { fout: null };
}

export async function verwijderUitgave(id: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const { error } = await ctx.supabase.from("geld_uitgaven").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) return { fout: fout(error, "Verwijderen is mislukt.") };
  opgeslagen();
  return { fout: null };
}

// ---------- doelen ----------

export interface DoelInvoer {
  naam: string;
  soort: "sparen" | "beleggen" | "overzicht";
  doel_bedrag: number | null;
  huidig_bedrag: number;
  streefdatum: string | null;
}

export async function bewaarDoel(invoer: DoelInvoer, id?: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  if (!["sparen", "beleggen", "overzicht"].includes(invoer.soort)) return { fout: "Onbekend soort." };
  const naam = (invoer.naam ?? "").trim().slice(0, 80);
  if (!naam) return { fout: "Geef je doel een naam." };
  const huidig = bedrag(invoer.huidig_bedrag);
  if (huidig === null) return { fout: "Vul een geldig bedrag in dat je al hebt." };
  let doel: number | null = null;
  if (invoer.soort !== "overzicht") {
    doel = bedrag(invoer.doel_bedrag, 0.01);
    if (doel === null) return { fout: "Vul het bedrag in dat je wilt bereiken." };
  }
  if (invoer.streefdatum && !isDatum(invoer.streefdatum)) return { fout: "Vul een geldige datum in." };

  const rij = { naam, soort: invoer.soort, doel_bedrag: doel, huidig_bedrag: huidig, streefdatum: invoer.soort === "overzicht" ? null : invoer.streefdatum || null };
  if (id) {
    const { data, error } = await ctx.supabase.from("geld_doelen").update(rij).eq("id", id).eq("user_id", ctx.user.id).select("id");
    if (error) return { fout: fout(error, "Opslaan is mislukt.") };
    if (!data || data.length === 0) return { fout: "Niet gevonden." };
  } else {
    const { error } = await ctx.supabase.from("geld_doelen").insert({ ...rij, user_id: ctx.user.id });
    if (error) return { fout: fout(error, "Opslaan is mislukt.") };
  }
  opgeslagen();
  return { fout: null };
}

export async function verwijderDoel(id: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const { error } = await ctx.supabase.from("geld_doelen").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) return { fout: fout(error, "Verwijderen is mislukt.") };
  opgeslagen();
  return { fout: null };
}

// ---------- instellingen ----------

export async function bewaarGeldInstellingen(invoer: { inkomen_override_maand: number | null; mes_mag_lezen: boolean }): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const inkomen = invoer.inkomen_override_maand == null ? null : bedrag(invoer.inkomen_override_maand);
  if (invoer.inkomen_override_maand != null && inkomen === null) return { fout: "Vul een geldig maandinkomen in." };
  const { error } = await ctx.supabase.from("geld_instellingen").upsert({ user_id: ctx.user.id, inkomen_override_maand: inkomen, mes_mag_lezen: !!invoer.mes_mag_lezen });
  if (error) return { fout: fout(error, "Opslaan is mislukt.") };
  opgeslagen();
  return { fout: null };
}

// ---------- verplichtingen met een deadline ----------

const MIGRATIE_VERPLICHTINGEN = "Verplichtingen met een deadline hebben een eenmalige database-update nodig (migratie 0009_geld_verplichtingen.sql in Supabase).";
const verplFout = (error: { code?: string; message?: string } | null, standaard: string) => (isTabelOntbreekt(error) ? MIGRATIE_VERPLICHTINGEN : standaard);
const isJaar = (d: string) => Number(d.slice(0, 4)) >= 2000 && Number(d.slice(0, 4)) <= 2100;

export interface VerplichtingInvoer {
  naam: string;
  bedrag: number;
  deadline: string;
  instantie?: string;
  notitie?: string;
}

export async function bewaarVerplichting(invoer: VerplichtingInvoer, id?: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const naam = (invoer.naam ?? "").trim().slice(0, 80);
  if (!naam) return { fout: "Geef het een naam, bijvoorbeeld wat het is of van wie." };
  const b = bedrag(invoer.bedrag, 0.01);
  if (b === null) return { fout: "Vul het bedrag in dat je nog moet betalen." };
  if (!isDatum(invoer.deadline) || !isJaar(invoer.deadline)) return { fout: "Vul een geldige deadline in." };

  const rij = {
    naam,
    bedrag: b,
    deadline: invoer.deadline,
    instantie: (invoer.instantie ?? "").trim().slice(0, 80) || null,
    notitie: (invoer.notitie ?? "").trim().slice(0, 300) || null,
  };
  if (id) {
    const { data, error } = await ctx.supabase.from("geld_verplichtingen").update(rij).eq("id", id).eq("user_id", ctx.user.id).select("id");
    if (error) return { fout: verplFout(error, "Opslaan is mislukt.") };
    if (!data || data.length === 0) return { fout: "Niet gevonden." };
  } else {
    const { error } = await ctx.supabase.from("geld_verplichtingen").insert({ ...rij, user_id: ctx.user.id });
    if (error) return { fout: verplFout(error, "Opslaan is mislukt.") };
  }
  revalidatePath("/geld");
  revalidatePath("/dashboard");
  return { fout: null };
}

export async function verwijderVerplichting(id: string): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  const { error } = await ctx.supabase.from("geld_verplichtingen").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) return { fout: verplFout(error, "Verwijderen is mislukt.") };
  revalidatePath("/geld");
  revalidatePath("/dashboard");
  return { fout: null };
}

// Zet een verplichting op betaald (datum) of weer open (null). Betaald stopt de herinneringen.
export async function markeerVerplichtingBetaald(id: string, datum: string | null): Promise<{ fout: string | null }> {
  const ctx = await context();
  if (!ctx) return GEEN_TOEGANG;
  if (datum !== null && (!isDatum(datum) || !isJaar(datum))) return { fout: "Vul een geldige datum in." };
  const { data, error } = await ctx.supabase.from("geld_verplichtingen").update({ betaald_op: datum }).eq("id", id).eq("user_id", ctx.user.id).select("id");
  if (error) return { fout: verplFout(error, "Opslaan is mislukt.") };
  if (!data || data.length === 0) return { fout: "Niet gevonden." };
  revalidatePath("/geld");
  revalidatePath("/dashboard");
  return { fout: null };
}
