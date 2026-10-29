import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { scanDocument, nietGeverifieerd } from "@/lib/extraction";
import { leesBestandUitOpslag } from "@/lib/scanBestand";
import { normalizeSupplierName } from "@/lib/types";
import type { Categorie, ExtractedInvoiceData } from "@/lib/types";

// Twee scans parallel (+ eventueel een derde ter controle) — ruim de tijd geven.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });
  }

  const { documentId } = await request.json();
  if (!documentId) {
    return NextResponse.json({ error: "documentId ontbreekt." }, { status: 400 });
  }

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("bedrijfsnaam, activiteiten, kvk_nummer, btw_nummer")
    .eq("user_id", user.id)
    .single();

  const uitkomst = await leesBestandUitOpslag(supabase, doc.file_url);
  if ("fout" in uitkomst) return NextResponse.json({ error: uitkomst.fout }, { status: uitkomst.status });
  // Dubbele, onafhankelijke scan met sterke modellen + controles in code (zie lib/extraction.ts).
  const contentBlock = uitkomst.bestand;

  let extracted: ExtractedInvoiceData;
  try {
    extracted = await scanDocument({
      bestand: contentBlock,
      eigenBedrijfsnaam: profile?.bedrijfsnaam ?? "",
      activiteiten: profile?.activiteiten ?? "",
      eigenKvk: profile?.kvk_nummer ?? null,
      eigenBtw: profile?.btw_nummer ?? null,
    });
  } catch (err) {
    console.error("Scannen mislukt:", err);
    extracted = nietGeverifieerd("De scan is niet gelukt.");
  }

  // Leveranciers-geheugen: de suppliers-tabel bevat uitsluitend geschiedenis van bevestigde
  // KOSTEN-facturen (zie rememberSupplier in lib/transactions.ts). Die geschiedenis mag daarom
  // nooit het "type" van een nieuwe factuur overschrijven — dezelfde partij kan net zo goed een
  // keer een omzetfactuur zijn (je verkoopt ook aan een leverancier, of andersom). We passen de
  // herinnering alleen toe op de categorie-suggestie, en alleen als de AI dit exemplaar zelf ook
  // al zeker als kosten heeft herkend. Bij onzekerheid ("type_onzeker") blijft de regel "bij
  // twijfel altijd vragen" leidend — dat wordt hier nooit stilzwijgend opgelost.
  if (extracted.leverancier && !extracted.type_onzeker && extracted.type === "kosten") {
    const naamGenormaliseerd = normalizeSupplierName(extracted.leverancier);
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("laatst_categorie, keer_gezien")
      .eq("user_id", user.id)
      .eq("naam_genormaliseerd", naamGenormaliseerd)
      .maybeSingle();

    if (supplier && supplier.keer_gezien >= 1 && supplier.laatst_categorie) {
      extracted.voorgestelde_categorie = supplier.laatst_categorie as Categorie;
    }
  }

  const status = extracted.leesbaarheid === "goed" ? "verwerkt" : "geflaggd";

  await supabase.from("documents").update({ ruwe_ai_output: extracted, status }).eq("id", documentId);

  return NextResponse.json({ data: extracted, status });
}
