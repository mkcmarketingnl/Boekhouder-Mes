import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { CLAUDE_MODEL_EXTRACT } from "@/lib/anthropic/client";
import { FACTUUR_CONTROLE_SYSTEM_PROMPT } from "@/lib/anthropic/factuurPrompts";
import { vraagJson } from "@/lib/anthropic/json";
import {
  bouwAfzender,
  berekenTotalen,
  controleerFactuur,
  formatFactuurnummer,
  vandaagNl,
  type AiControle,
  type Bevinding,
  type FactuurGegevens,
  type InvoiceSettings,
  type SalesInvoice,
} from "@/lib/facturen";

export const maxDuration = 60;

interface AiAntwoord {
  samenvatting: string;
  bevindingen: Bevinding[];
}

const GELDIGE_VELDEN = ["klant", "regels", "btw", "datum", "nummer", "afzender", "notitie"];

// Controleert een factuur op fouten: eerst harde controles in code, daarna een inhoudelijke AI-controle die
// bij elk punt uitlegt waarom het fout is. Het resultaat wordt bij de factuur bewaard.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "Factuur ontbreekt." }, { status: 400 });

  const { data: rij, error: factuurFout } = await supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle();
  if (factuurFout) return NextResponse.json({ error: "Factuur ophalen is mislukt." }, { status: 500 });
  const factuur = rij as SalesInvoice | null;
  if (!factuur) return NextResponse.json({ error: "Factuur niet gevonden." }, { status: 404 });

  const [{ data: settingsRij }, { data: profielRij }, { data: vorige }] = await Promise.all([
    supabase.from("invoice_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("bedrijfsnaam, kvk_nummer, btw_nummer, activiteiten").eq("user_id", user.id).maybeSingle(),
    supabase.from("sales_invoices").select("factuurnummer").eq("user_id", user.id).eq("status", "definitief").neq("id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const settings = settingsRij as InvoiceSettings | null;
  if (!profielRij) return NextResponse.json({ error: "Bedrijfsprofiel ontbreekt." }, { status: 400 });

  const afzender = factuur.afzender ?? bouwAfzender(profielRij, settings);
  const kor = factuur.status === "definitief" ? factuur.kor : !!settings?.kor;
  const nummer =
    factuur.status === "definitief" || !settings ? factuur.factuurnummer : formatFactuurnummer(settings.factuurnummer_prefix, settings.volgend_factuurnummer);
  const gegevens: FactuurGegevens = {
    factuurnummer: nummer,
    klant_naam: factuur.klant_naam,
    klant_adres: factuur.klant_adres,
    klant_postcode: factuur.klant_postcode,
    klant_plaats: factuur.klant_plaats,
    klant_land: factuur.klant_land,
    klant_btw_nummer: factuur.klant_btw_nummer,
    klant_kvk: factuur.klant_kvk,
    factuurdatum: factuur.factuurdatum,
    vervaldatum: factuur.vervaldatum,
    leverdatum: factuur.leverdatum,
    regels: factuur.regels,
    btw_verlegd: factuur.btw_verlegd,
    kor,
    notitie: factuur.notitie,
  };

  const vandaag = vandaagNl();
  const codeBevindingen = controleerFactuur(gegevens, afzender, { vorigNummer: vorige?.[0]?.factuurnummer ?? null, vandaag });
  const totalen = berekenTotalen(factuur.regels, { btw_verlegd: factuur.btw_verlegd, kor });

  let samenvatting = "";
  let aiBevindingen: Bevinding[] = [];
  let aiGelukt = true;
  try {
    const gebruiker = JSON.stringify(
      {
        afzender: { ...afzender },
        klant: { naam: gegevens.klant_naam, adres: gegevens.klant_adres, postcode: gegevens.klant_postcode, plaats: gegevens.klant_plaats, land: gegevens.klant_land, btw_nummer: gegevens.klant_btw_nummer, kvk: gegevens.klant_kvk, email: factuur.klant_email },
        factuurnummer: gegevens.factuurnummer,
        factuurdatum: gegevens.factuurdatum,
        vervaldatum: gegevens.vervaldatum,
        leverdatum: gegevens.leverdatum,
        regels: gegevens.regels,
        btw_verlegd: gegevens.btw_verlegd,
        kleineondernemersregeling: gegevens.kor,
        notitie: gegevens.notitie,
        berekende_totalen: totalen,
        al_gevonden_bevindingen: codeBevindingen.map((b) => b.melding),
        vandaag,
      },
      null,
      2
    );
    const antwoord = await vraagJson<AiAntwoord>({ model: CLAUDE_MODEL_EXTRACT, system: FACTUUR_CONTROLE_SYSTEM_PROMPT, gebruiker });
    if (!antwoord || !Array.isArray(antwoord.bevindingen)) throw new Error("Onleesbaar antwoord");
    samenvatting = String(antwoord.samenvatting ?? "").slice(0, 400);
    aiBevindingen = antwoord.bevindingen
      .filter((b) => b && typeof b.melding === "string" && b.melding.trim())
      .slice(0, 12)
      .map((b) => ({
        // Een onleesbare "ernst" (het model typt weleens een sleutel fout) laten we nooit stilletjes vallen:
        // liever een aandachtspunt te veel dan een gevonden probleem kwijt.
        ernst: (b.ernst === "fout" ? "fout" : "let_op") as Bevinding["ernst"],
        veld: GELDIGE_VELDEN.includes(b.veld) ? b.veld : "regels",
        melding: String(b.melding).slice(0, 300),
        uitleg: String(b.uitleg ?? "").slice(0, 600),
      }));
  } catch (err) {
    console.error("AI-controle van factuur mislukt:", err);
    aiGelukt = false;
    samenvatting = "De automatische controles zijn uitgevoerd, maar de AI-controle kon nu niet draaien. Probeer het zo nog eens.";
  }

  // Samenvoegen, zonder dubbelen (zelfde melding, of de AI herhaalt iets uit de codecontrole).
  const gezien = new Set(codeBevindingen.map((b) => b.melding.toLowerCase()));
  const bevindingen: Bevinding[] = [...codeBevindingen, ...aiBevindingen.filter((b) => !gezien.has(b.melding.toLowerCase()))];
  const resultaat: AiControle & { aiGelukt: boolean } = {
    samenvatting:
      samenvatting ||
      (bevindingen.length === 0 ? "Alles lijkt in orde." : `Er ${bevindingen.length === 1 ? "is 1 punt" : `zijn ${bevindingen.length} punten`} om naar te kijken.`),
    bevindingen,
    aiGelukt,
  };

  // Bewaar het resultaat bij de factuur (mag ook bij een definitieve factuur: de database laat alleen dit veld toe).
  if (aiGelukt) {
    await supabase.from("sales_invoices").update({ ai_controle: { samenvatting: resultaat.samenvatting, bevindingen }, ai_controle_op: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({ data: resultaat });
}
