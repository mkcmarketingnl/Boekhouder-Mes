import { createClient } from "@/lib/supabase/client";
import { kostAlsTransactie, saveTransaction, updateTransaction } from "@/lib/transactions";
import type { Bevinding } from "@/lib/administratiecontrole";
import { normaliseerRegels, type BtwRegel } from "@/lib/btw";

// Voert één voorstel van de administratiecontrole uit, met de gewone opslaan/bijwerken-functies van de app (dus met
// dezelfde rekenregels voor BTW en dezelfde beveiliging per gebruiker). Wijzigt altijd alleen wat het voorstel noemt.
export async function pasBevindingToe(userId: string, documentId: string, bevinding: Bevinding): Promise<{ error: string | null }> {
  const supabase = createClient();
  const fix = bevinding.fix;

  if (fix.soort === "wijzig") {
    const { data: tx } = await supabase.from("transactions").select("*").eq("id", fix.transactie_id).eq("user_id", userId).maybeSingle();
    if (!tx) return { error: "Deze boeking bestaat niet meer." };
    const regels = (Array.isArray(tx.btw_regels) && tx.btw_regels.length >= 2 ? tx.btw_regels : null) as BtwRegel[] | null;
    const v = fix.velden;
    return updateTransaction(userId, tx.id, {
      factuurnummer: v.factuurnummer !== undefined ? v.factuurnummer : tx.factuurnummer,
      factuurdatum: v.factuurdatum ?? tx.factuurdatum,
      leverancier: v.leverancier ?? tx.leverancier,
      omschrijving: tx.omschrijving,
      bedrag_incl_btw: v.bedrag_incl_btw ?? Number(tx.bedrag_incl_btw),
      btw_percentage: v.btw_percentage ?? Number(tx.btw_percentage),
      btw_regels: regels,
      hadBtwRegels: !!regels,
      type: v.type ?? tx.type,
      categorie: tx.categorie,
    });
  }

  if (fix.soort === "zet_btw_regels") {
    const { data: tx } = await supabase.from("transactions").select("*").eq("id", fix.transactie_id).eq("user_id", userId).maybeSingle();
    if (!tx) return { error: "Deze boeking bestaat niet meer." };
    const regels = normaliseerRegels(fix.regels.map((r) => ({ percentage: r.percentage, bedrag_incl_btw: r.bedrag_incl_btw })));
    if (regels.length < 2) return { error: "De BTW-verdeling kon niet worden bepaald. Pas de boeking zelf aan." };
    // De totalen volgen uit de regels (som per tarief, in hele centen), net als bij het opslaan van een nieuwe bon
    return updateTransaction(userId, tx.id, {
      factuurnummer: tx.factuurnummer,
      factuurdatum: tx.factuurdatum,
      leverancier: tx.leverancier,
      omschrijving: tx.omschrijving,
      bedrag_incl_btw: Number(tx.bedrag_incl_btw),
      btw_percentage: Number(tx.btw_percentage),
      btw_regels: regels as BtwRegel[],
      hadBtwRegels: Array.isArray(tx.btw_regels) && tx.btw_regels.length >= 2,
      type: tx.type,
      categorie: tx.categorie,
    });
  }

  if (fix.soort === "voeg_kosten_toe") {
    const { data: txs } = await supabase.from("transactions").select("id, type, leverancier, factuurnummer, factuurdatum, bedrag_incl_btw").eq("user_id", userId).eq("document_id", documentId);
    const hoofd = (txs ?? []).filter((t) => t.type === "omzet").sort((a, b) => Number(b.bedrag_incl_btw) - Number(a.bedrag_incl_btw))[0];
    if (!hoofd) return { error: "De verkoopfactuur bij deze kosten is niet gevonden." };
    // Nooit twee keer dezelfde kostenpost aanmaken (bijv. bij dubbelklikken of een tweede controle)
    const bestaand = (txs ?? []).some((t) => t.type === "kosten" && Math.abs(Number(t.bedrag_incl_btw) - fix.kost.bedrag_incl_btw) <= 0.011);
    if (bestaand) return { error: null };
    const res = await saveTransaction(userId, {
      ...kostAlsTransactie(fix.kost, { document_id: documentId, factuurdatum: hoofd.factuurdatum, factuurnummer: hoofd.factuurnummer, leverancier: hoofd.leverancier }),
      ingehouden_op: hoofd.id,
    });
    return { error: res.error };
  }

  return { error: null };
}

// Onthoudt dat een bevinding is afgehandeld (hersteld of bewust zo gelaten), zodat hij niet terugkomt.
export async function markeerAfgehandeld(userId: string, documentId: string, huidig: string[], id: string): Promise<{ error: string | null; afgehandeld: string[] }> {
  const supabase = createClient();
  const nieuw = [...new Set([...huidig, id])];
  const { error } = await supabase.from("document_controles").update({ afgehandeld: nieuw }).eq("document_id", documentId).eq("user_id", userId);
  return { error: error ? "Opslaan is mislukt." : null, afgehandeld: error ? huidig : nieuw };
}

// Opent het originele document in een nieuw tabblad.
export async function openDocument(fileUrl: string): Promise<boolean> {
  const venster = window.open("", "_blank");
  const { data } = await createClient().storage.from("documents").createSignedUrl(fileUrl, 3600);
  if (!data?.signedUrl) {
    venster?.close();
    return false;
  }
  if (venster) venster.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return true;
}
