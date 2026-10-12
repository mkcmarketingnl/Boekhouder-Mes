"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import {
  bouwAfzender,
  berekenTotalen,
  controleerFactuur,
  formatFactuurnummer,
  isTabelOntbreekt,
  MIGRATIE_MELDING,
  naarBtwRegels,
  prijsExclWeergave,
  vandaagNl,
  volgnummerUit,
  type Bevinding,
  type FactuurGegevens,
  type FactuurRegel,
  type FactuurTemplate,
  type InvoiceSettings,
  type SalesInvoice,
} from "@/lib/facturen";

export interface ActieResultaat<T = undefined> {
  fout: string | null;
  data?: T;
}

async function context() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, hasAccess: false };
  const { hasAccess } = await getAccessStatus(user.id);
  return { supabase, user, hasAccess };
}

const GEEN_TOEGANG = "Geen actief abonnement.";

function dbFout(error: { code?: string; message?: string }, standaard: string): string {
  return isTabelOntbreekt(error) ? MIGRATIE_MELDING : standaard;
}

const vandaag = vandaagNl;

// ---------- instellingen ----------

export interface InstellingenInvoer {
  adres: string;
  postcode: string;
  plaats: string;
  land: string;
  iban: string;
  bic: string;
  telefoon: string;
  email: string;
  website: string;
  kvk_nummer: string;
  btw_nummer: string;
  betaaltermijn_dagen: number;
  factuurnummer_prefix: string;
  volgend_factuurnummer: number;
  standaard_template: FactuurTemplate;
  standaard_notitie: string;
  kor: boolean;
}

const schoon = (s: string) => (s ?? "").trim() || null;

export async function bewaarInstellingen(invoer: InstellingenInvoer): Promise<ActieResultaat> {
  const { supabase, user, hasAccess } = await context();
  if (!user || !hasAccess) return { fout: GEEN_TOEGANG };

  const dagen = Math.max(0, Math.min(365, Math.round(Number(invoer.betaaltermijn_dagen) || 14)));
  const volgend = Math.max(1, Math.round(Number(invoer.volgend_factuurnummer) || 1));

  const { error } = await supabase.from("invoice_settings").upsert({
    user_id: user.id,
    adres: schoon(invoer.adres),
    postcode: schoon(invoer.postcode),
    plaats: schoon(invoer.plaats),
    land: schoon(invoer.land) ?? "Nederland",
    iban: schoon(invoer.iban)?.replace(/\s+/g, "").toUpperCase() ?? null,
    bic: schoon(invoer.bic),
    telefoon: schoon(invoer.telefoon),
    email: schoon(invoer.email),
    website: schoon(invoer.website),
    betaaltermijn_dagen: dagen,
    factuurnummer_prefix: (invoer.factuurnummer_prefix ?? "").trim(),
    volgend_factuurnummer: volgend,
    standaard_template: invoer.standaard_template,
    standaard_notitie: schoon(invoer.standaard_notitie),
    kor: !!invoer.kor,
  });
  if (error) return { fout: dbFout(error, "Opslaan van de instellingen is mislukt.") };

  // KVK- en BTW-nummer staan op het bedrijfsprofiel (die gebruikt de rest van de app ook)
  await supabase
    .from("profiles")
    .update({ kvk_nummer: schoon(invoer.kvk_nummer), btw_nummer: schoon(invoer.btw_nummer)?.replace(/[\s.]/g, "").toUpperCase() ?? null })
    .eq("user_id", user.id);

  revalidatePath("/facturen", "layout");
  return { fout: null };
}

// ---------- concept bewaren ----------

export interface FactuurInvoer {
  id?: string;
  klant_naam: string;
  klant_adres: string;
  klant_postcode: string;
  klant_plaats: string;
  klant_land: string;
  klant_btw_nummer: string;
  klant_kvk: string;
  klant_email: string;
  factuurdatum: string;
  vervaldatum: string;
  leverdatum: string;
  regels: FactuurRegel[];
  btw_verlegd: boolean;
  notitie: string;
  template: FactuurTemplate;
}

function opschonenRegels(regels: FactuurRegel[]): FactuurRegel[] {
  return regels.map((r) => {
    const schoon: FactuurRegel = {
      omschrijving: (r.omschrijving ?? "").trim(),
      aantal: Number(r.aantal) || 0,
      prijs_excl: Number(r.prijs_excl) || 0,
      btw_percentage: [21, 9, 0].includes(Number(r.btw_percentage)) ? Number(r.btw_percentage) : 21,
    };
    const toelichting = (r.toelichting ?? "").trim().slice(0, 500);
    if (toelichting) schoon.toelichting = toelichting;
    // Incl.-prijs blijft leidend; prijs_excl is dan de afgeleide weergave (de KOR/verlegd-regel wordt pas bij het berekenen toegepast).
    if (r.prijs_incl != null && Number.isFinite(Number(r.prijs_incl))) {
      schoon.prijs_incl = Number(r.prijs_incl);
      schoon.prijs_excl = prijsExclWeergave(schoon);
    }
    return schoon;
  });
}

export async function bewaarFactuur(invoer: FactuurInvoer): Promise<ActieResultaat<{ id: string }>> {
  const { supabase, user, hasAccess } = await context();
  if (!user || !hasAccess) return { fout: GEEN_TOEGANG };

  const { data: settings, error: settingsError } = await supabase.from("invoice_settings").select("kor").eq("user_id", user.id).maybeSingle();
  if (settingsError) return { fout: dbFout(settingsError, "Opslaan is mislukt.") };
  const kor = !!settings?.kor;

  const regels = opschonenRegels(invoer.regels);
  const totalen = berekenTotalen(regels, { btw_verlegd: invoer.btw_verlegd, kor });

  const rij = {
    klant_naam: invoer.klant_naam.trim(),
    klant_adres: schoon(invoer.klant_adres),
    klant_postcode: schoon(invoer.klant_postcode),
    klant_plaats: schoon(invoer.klant_plaats),
    klant_land: schoon(invoer.klant_land) ?? "Nederland",
    klant_btw_nummer: schoon(invoer.klant_btw_nummer)?.replace(/[\s.]/g, "").toUpperCase() ?? null,
    klant_kvk: schoon(invoer.klant_kvk),
    klant_email: schoon(invoer.klant_email),
    factuurdatum: invoer.factuurdatum || vandaag(),
    vervaldatum: invoer.vervaldatum || invoer.factuurdatum || vandaag(),
    leverdatum: invoer.leverdatum || null,
    regels,
    btw_verlegd: !!invoer.btw_verlegd,
    kor,
    notitie: schoon(invoer.notitie),
    template: invoer.template,
    totaal_excl: totalen.excl,
    totaal_btw: totalen.btw,
    totaal_incl: totalen.incl,
  };

  if (invoer.id) {
    const { data, error } = await supabase.from("sales_invoices").update(rij).eq("id", invoer.id).eq("status", "concept").select("id");
    if (error) return { fout: dbFout(error, "Opslaan van het concept is mislukt.") };
    if (!data || data.length === 0) return { fout: "Deze factuur is al definitief en kan niet meer worden gewijzigd." };
    revalidatePath("/facturen", "layout");
    return { fout: null, data: { id: invoer.id } };
  }

  // Een concept krijgt een tijdelijk nummer; het echte, oplopende nummer wordt pas bij "definitief maken" toegekend,
  // zodat er nooit gaten ontstaan door weggegooide concepten.
  const tijdelijk = `CONCEPT-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase.from("sales_invoices").insert({ ...rij, user_id: user.id, factuurnummer: tijdelijk, status: "concept" }).select("id").single();
  if (error || !data) return { fout: error ? dbFout(error, "Opslaan van het concept is mislukt.") : "Opslaan is mislukt." };
  revalidatePath("/facturen", "layout");
  return { fout: null, data: { id: data.id } };
}

export async function verwijderConcept(id: string): Promise<ActieResultaat> {
  const { supabase, user, hasAccess } = await context();
  if (!user || !hasAccess) return { fout: GEEN_TOEGANG };
  const { data, error } = await supabase.from("sales_invoices").delete().eq("id", id).eq("status", "concept").select("id");
  if (error) return { fout: dbFout(error, "Verwijderen is mislukt.") };
  if (!data || data.length === 0) return { fout: "Alleen een concept kan worden verwijderd; een definitieve factuur blijft bewaard." };
  revalidatePath("/facturen", "layout");
  return { fout: null };
}

// ---------- definitief maken ----------

export interface DefinitiefResultaat {
  id: string;
  factuurnummer: string;
  bevindingen: Bevinding[];
  geboekt: boolean;
}

export interface DefinitiefOpties {
  boekInOmzet: boolean;
  // De gebruiker heeft de "let op"-meldingen gezien en wil toch doorgaan.
  akkoordLetOps: boolean;
}

function gegevensVan(f: SalesInvoice, factuurnummer: string): FactuurGegevens {
  return {
    factuurnummer,
    klant_naam: f.klant_naam,
    klant_adres: f.klant_adres,
    klant_postcode: f.klant_postcode,
    klant_plaats: f.klant_plaats,
    klant_land: f.klant_land,
    klant_btw_nummer: f.klant_btw_nummer,
    klant_kvk: f.klant_kvk,
    factuurdatum: f.factuurdatum,
    vervaldatum: f.vervaldatum,
    leverdatum: f.leverdatum,
    regels: f.regels,
    btw_verlegd: f.btw_verlegd,
    kor: f.kor,
    notitie: f.notitie,
  };
}

export async function maakDefinitief(
  id: string,
  opties: DefinitiefOpties
): Promise<ActieResultaat<DefinitiefResultaat> & { bevindingen?: Bevinding[]; vereistAkkoord?: boolean }> {
  const { supabase, user, hasAccess } = await context();
  if (!user || !hasAccess) return { fout: GEEN_TOEGANG };

  const { data: factuurRij, error: factuurFout } = await supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle();
  if (factuurFout) return { fout: dbFout(factuurFout, "Factuur ophalen is mislukt.") };
  const factuur = factuurRij as SalesInvoice | null;
  if (!factuur) return { fout: "Factuur niet gevonden." };
  if (factuur.status === "definitief") return { fout: "Deze factuur is al definitief." };

  const [{ data: settingsRij }, { data: profielRij }, { data: vorige }] = await Promise.all([
    supabase.from("invoice_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("bedrijfsnaam, kvk_nummer, btw_nummer").eq("user_id", user.id).maybeSingle(),
    supabase.from("sales_invoices").select("factuurnummer").eq("user_id", user.id).eq("status", "definitief").order("created_at", { ascending: false }).limit(1),
  ]);
  const settings = settingsRij as InvoiceSettings | null;
  if (!settings || !profielRij) return { fout: "Vul eerst je factuurinstellingen in." };

  // Eerstvolgende vrije nummer
  let volgnr = settings.volgend_factuurnummer;
  let nummer = formatFactuurnummer(settings.factuurnummer_prefix, volgnr);
  for (let i = 0; i < 100; i++) {
    const { data: bestaat } = await supabase.from("sales_invoices").select("id").eq("user_id", user.id).eq("factuurnummer", nummer).limit(1);
    if (!bestaat || bestaat.length === 0) break;
    volgnr += 1;
    nummer = formatFactuurnummer(settings.factuurnummer_prefix, volgnr);
  }

  const afzender = bouwAfzender(profielRij, settings);
  const kor = settings.kor;
  const regels = opschonenRegels(factuur.regels);
  const totalen = berekenTotalen(regels, { btw_verlegd: factuur.btw_verlegd, kor });
  const gegevens: FactuurGegevens = { ...gegevensVan({ ...factuur, regels, kor }, nummer), kor };

  const bevindingen = controleerFactuur(gegevens, afzender, { vorigNummer: vorige?.[0]?.factuurnummer ?? null, vandaag: vandaag() });
  const fouten = bevindingen.filter((b) => b.ernst === "fout");
  if (fouten.length > 0) return { fout: "Er zijn nog fouten die je eerst moet oplossen.", bevindingen };
  if (bevindingen.length > 0 && !opties.akkoordLetOps) return { fout: null, vereistAkkoord: true, bevindingen };

  const { data: bijgewerkt, error: updateFout } = await supabase
    .from("sales_invoices")
    .update({
      status: "definitief",
      factuurnummer: nummer,
      afzender,
      kor,
      regels,
      totaal_excl: totalen.excl,
      totaal_btw: totalen.btw,
      totaal_incl: totalen.incl,
    })
    .eq("id", id)
    .eq("status", "concept")
    .select("id");
  if (updateFout) return { fout: dbFout(updateFout, "Definitief maken is mislukt.") };
  if (!bijgewerkt || bijgewerkt.length === 0) return { fout: "Definitief maken is mislukt: de factuur is intussen gewijzigd." };

  await supabase.from("invoice_settings").update({ volgend_factuurnummer: Math.max(volgnr, volgnummerUit(nummer) ?? volgnr) + 1 }).eq("user_id", user.id);

  let geboekt = false;
  if (opties.boekInOmzet) {
    const boeking = await boekInOmzet(id);
    geboekt = !boeking.fout;
  }

  revalidatePath("/facturen", "layout");
  revalidatePath("/dashboard");
  return { fout: null, data: { id, factuurnummer: nummer, bevindingen, geboekt } };
}

// ---------- omzetboeking ----------

// Boekt een definitieve factuur als omzet in de administratie (dashboard, BTW-saldo en klantenoverzicht).
// Eén keer per factuur; de duplicaatcontrole voorkomt dat dezelfde factuur ook nog eens wordt gescand en dubbel geboekt.
export async function boekInOmzet(id: string): Promise<ActieResultaat> {
  const { supabase, user, hasAccess } = await context();
  if (!user || !hasAccess) return { fout: GEEN_TOEGANG };

  const { data: rij, error } = await supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle();
  if (error) return { fout: dbFout(error, "Factuur ophalen is mislukt.") };
  const f = rij as SalesInvoice | null;
  if (!f) return { fout: "Factuur niet gevonden." };
  if (f.status !== "definitief") return { fout: "Maak de factuur eerst definitief." };
  if (f.transaction_id) return { fout: "Deze factuur staat al in je omzet." };

  const { data: dubbel } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .ilike("leverancier", f.klant_naam)
    .ilike("factuurnummer", f.factuurnummer)
    .limit(1);
  if (dubbel && dubbel.length > 0) return { fout: "Er staat al een factuur met dit nummer voor deze klant in je administratie." };

  const totalen = berekenTotalen(f.regels, { btw_verlegd: f.btw_verlegd, kor: f.kor });
  const btwRegels = naarBtwRegels(totalen);
  const hoofd = [...totalen.perTarief].sort((a, b) => b.grondslag - a.grondslag)[0]?.percentage ?? 0;
  const omschrijving = f.regels.map((r) => r.omschrijving).filter(Boolean).join("; ").slice(0, 200) || null;

  const { data: nieuw, error: insertFout } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      document_id: null,
      factuurnummer: f.factuurnummer,
      factuurdatum: f.factuurdatum,
      leverancier: f.klant_naam,
      omschrijving,
      bedrag_incl_btw: totalen.incl,
      bedrag_excl_btw: totalen.excl,
      btw_bedrag: totalen.btw,
      btw_percentage: hoofd,
      ...(btwRegels ? { btw_regels: btwRegels } : {}),
      type: "omzet",
      categorie: "Overig",
      risico: "laag",
      risico_toelichting: null,
      invoerwijze: "handmatig",
    })
    .select("id")
    .single();
  if (insertFout || !nieuw) return { fout: insertFout && /btw_regels/i.test(insertFout.message) ? "Een factuur met meerdere BTW-tarieven boeken kan pas nadat de database-update (migratie 0005) is uitgevoerd." : "Boeken in je omzet is mislukt." };

  const { error: koppelFout } = await supabase.from("sales_invoices").update({ transaction_id: nieuw.id }).eq("id", id);
  if (koppelFout) {
    // niet half laten staan: anders zou de factuur straks nog eens geboekt kunnen worden
    await supabase.from("transactions").delete().eq("id", nieuw.id);
    return { fout: "Boeken in je omzet is mislukt." };
  }

  revalidatePath("/facturen", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/relaties");
  return { fout: null };
}
