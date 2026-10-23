import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { scanDocument, nietGeverifieerd } from "@/lib/extraction";
import { leesBestandUitOpslag } from "@/lib/scanBestand";
import { vergelijkDocument, type OpgeslagenTx, type ScanUitkomst } from "@/lib/administratiecontrole";
import { isTabelOntbreekt } from "@/lib/facturen";
import type { ExtractedInvoiceData } from "@/lib/types";

// Een volledige scan (twee lezingen + zo nodig een controle) per document.
export const maxDuration = 60;

const MAX_PER_DAG = 800;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function naarScanUitkomst(e: ExtractedInvoiceData): ScanUitkomst {
  return {
    type: e.type,
    leverancier: e.leverancier,
    factuurnummer: e.factuurnummer,
    factuurdatum: e.factuurdatum,
    bedrag_incl_btw: e.bedrag_incl_btw,
    bedrag_excl_btw: e.bedrag_excl_btw,
    btw_bedrag: e.btw_bedrag,
    btw_percentage: e.btw_percentage,
    heeftBtwRegels: !!e.btw_regels && e.btw_regels.length >= 2,
    verrekende_kosten: e.verrekende_kosten ?? null,
    eindbedrag: e.eindbedrag ?? null,
    controle_status: e.controle_status,
    controle_afwijkingen: e.controle_afwijkingen ?? [],
  };
}

// Controleert één al geüpload document: scant het origineel opnieuw met de volledige, nieuwste scan en vergelijkt dat met wat
// je hebt opgeslagen. Er wordt niets aan je boekingen veranderd; het resultaat (verschillen + voorstel) wordt bewaard.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  if (!UUID.test(documentId)) return NextResponse.json({ error: "documentId ontbreekt of is ongeldig." }, { status: 400 });

  // Vangnet tegen onbedoelde of misbruikte massa-scans (elke scan kost AI-tijd)
  const sinds = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: vandaagGedaan, error: telFout } = await supabase.from("document_controles").select("document_id", { count: "exact", head: true }).eq("user_id", user.id).gte("gecontroleerd_op", sinds);
  if (telFout) {
    return NextResponse.json({ error: isTabelOntbreekt(telFout) ? "De administratiecontrole heeft een eenmalige database-update nodig (migratie 0010_document_controles.sql in Supabase)." : "Controle starten is mislukt." }, { status: isTabelOntbreekt(telFout) ? 409 : 500 });
  }
  if ((vandaagGedaan ?? 0) >= MAX_PER_DAG) return NextResponse.json({ error: "Je hebt vandaag al veel documenten gecontroleerd. Ga morgen verder." }, { status: 429 });

  const { data: doc } = await supabase.from("documents").select("id, file_url").eq("id", documentId).eq("user_id", user.id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });

  const { data: txRijen, error: txFout } = await supabase
    .from("transactions")
    .select("id, type, leverancier, factuurnummer, factuurdatum, bedrag_incl_btw, bedrag_excl_btw, btw_bedrag, btw_percentage, btw_regels")
    .eq("user_id", user.id)
    .eq("document_id", documentId);
  if (txFout) return NextResponse.json({ error: "Boekingen ophalen is mislukt." }, { status: 500 });
  if (!txRijen || txRijen.length === 0) return NextResponse.json({ error: "Dit document heeft geen boeking." }, { status: 404 });

  const txs: OpgeslagenTx[] = txRijen.map((t) => ({
    id: t.id,
    type: t.type,
    leverancier: t.leverancier,
    factuurnummer: t.factuurnummer,
    factuurdatum: t.factuurdatum,
    bedrag_incl_btw: Number(t.bedrag_incl_btw),
    bedrag_excl_btw: Number(t.bedrag_excl_btw),
    btw_bedrag: Number(t.btw_bedrag),
    btw_percentage: Number(t.btw_percentage),
    heeftBtwRegels: Array.isArray(t.btw_regels) && t.btw_regels.length >= 2,
  }));

  const { data: profiel } = await supabase.from("profiles").select("bedrijfsnaam, activiteiten").eq("user_id", user.id).single();

  const uitkomst = await leesBestandUitOpslag(supabase, doc.file_url);
  let rij: { uitslag: string; bevindingen: unknown; scan_meldingen: string[]; scan_onzeker: boolean };
  if ("fout" in uitkomst) {
    rij = { uitslag: "mislukt", bevindingen: [], scan_meldingen: [uitkomst.fout], scan_onzeker: true };
  } else {
    let scan: ExtractedInvoiceData;
    try {
      scan = await scanDocument({ bestand: uitkomst.bestand, eigenBedrijfsnaam: profiel?.bedrijfsnaam ?? "", activiteiten: profiel?.activiteiten ?? "" });
    } catch (err) {
      console.error("Controle-scan mislukt:", err);
      scan = nietGeverifieerd("De scan is niet gelukt.");
    }
    const resultaat = vergelijkDocument(txs, naarScanUitkomst(scan));
    rij = { uitslag: resultaat.uitslag, bevindingen: resultaat.bevindingen, scan_meldingen: resultaat.scanMeldingen, scan_onzeker: resultaat.scanOnzeker };
  }

  const volledig = { document_id: documentId, user_id: user.id, ...rij, gecontroleerd_op: new Date().toISOString(), afgehandeld: [] as string[] };
  const { error: opslagFout } = await supabase.from("document_controles").upsert(volledig);
  if (opslagFout) return NextResponse.json({ error: "Resultaat bewaren is mislukt." }, { status: 500 });
  return NextResponse.json({ data: volledig });
}
