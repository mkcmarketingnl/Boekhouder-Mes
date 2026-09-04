import { createClient } from "@/lib/supabase/client";
import { berekenExclBtw } from "@/lib/format";
import { normalizeSupplierName } from "@/lib/types";
import type { Invoerwijze, RisicoNiveau, TransactieType, Transaction } from "@/lib/types";

export interface SaveTransactionInput {
  document_id: string | null;
  factuurnummer: string | null;
  factuurdatum: string;
  leverancier: string;
  omschrijving: string | null;
  bedrag_incl_btw: number;
  btw_percentage: number;
  type: TransactieType;
  categorie: string;
  risico: RisicoNiveau;
  risico_toelichting: string | null;
  invoerwijze: Invoerwijze;
}

async function rememberSupplier(userId: string, leverancier: string, categorie: string, type: TransactieType) {
  const supabase = createClient();
  const naamGenormaliseerd = normalizeSupplierName(leverancier);
  if (!naamGenormaliseerd) return;

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, keer_gezien")
    .eq("user_id", userId)
    .eq("naam_genormaliseerd", naamGenormaliseerd)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("suppliers")
      .update({
        naam: leverancier,
        laatst_categorie: categorie,
        laatst_type: type,
        keer_gezien: existing.keer_gezien + 1,
        laatst_gebruikt: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("suppliers").insert({
      user_id: userId,
      naam: leverancier,
      naam_genormaliseerd: naamGenormaliseerd,
      laatst_categorie: categorie,
      laatst_type: type,
    });
  }
}

export async function checkDuplicateFactuur(
  userId: string,
  leverancier: string,
  factuurnummer: string | null,
  excludeTransactionId?: string
): Promise<Transaction | null> {
  if (!factuurnummer?.trim() || !leverancier?.trim()) return null;

  const supabase = createClient();
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .ilike("leverancier", leverancier.trim())
    .ilike("factuurnummer", factuurnummer.trim())
    .limit(1);

  if (excludeTransactionId) {
    query = query.neq("id", excludeTransactionId);
  }

  const { data } = await query.maybeSingle();
  return (data as Transaction | null) ?? null;
}

export async function saveTransaction(
  userId: string,
  input: SaveTransactionInput
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { bedragExclBtw, btwBedrag } = berekenExclBtw(input.bedrag_incl_btw, input.btw_percentage);

  const { error } = await supabase.from("transactions").insert({
    document_id: input.document_id,
    user_id: userId,
    factuurnummer: input.factuurnummer,
    factuurdatum: input.factuurdatum,
    leverancier: input.leverancier,
    omschrijving: input.omschrijving,
    bedrag_incl_btw: input.bedrag_incl_btw,
    bedrag_excl_btw: bedragExclBtw,
    btw_bedrag: btwBedrag,
    btw_percentage: input.btw_percentage,
    type: input.type,
    categorie: input.categorie,
    risico: input.risico,
    risico_toelichting: input.risico_toelichting,
    invoerwijze: input.invoerwijze,
  });

  if (error) {
    return { error: "Opslaan is mislukt. Probeer het opnieuw." };
  }

  if (input.document_id) {
    await supabase.from("documents").update({ status: "verwerkt" }).eq("id", input.document_id);
  }

  if (input.type === "kosten") {
    await rememberSupplier(userId, input.leverancier, input.categorie, input.type);
  }

  return { error: null };
}

export interface UpdateTransactionInput {
  factuurnummer: string | null;
  factuurdatum: string;
  leverancier: string;
  omschrijving: string | null;
  bedrag_incl_btw: number;
  btw_percentage: number;
  type: TransactieType;
  categorie: string;
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput
): Promise<{ error: string | null }> {
  if (!input.leverancier.trim() || !input.factuurdatum || !input.bedrag_incl_btw) {
    return { error: "Vul minimaal leverancier, datum en bedrag in." };
  }

  const supabase = createClient();
  const { bedragExclBtw, btwBedrag } = berekenExclBtw(input.bedrag_incl_btw, input.btw_percentage);

  const { error } = await supabase
    .from("transactions")
    .update({
      factuurnummer: input.factuurnummer,
      factuurdatum: input.factuurdatum,
      leverancier: input.leverancier,
      omschrijving: input.omschrijving,
      bedrag_incl_btw: input.bedrag_incl_btw,
      bedrag_excl_btw: bedragExclBtw,
      btw_bedrag: btwBedrag,
      btw_percentage: input.btw_percentage,
      type: input.type,
      categorie: input.categorie,
    })
    .eq("id", transactionId);

  if (error) {
    return { error: "Bijwerken is mislukt. Probeer het opnieuw." };
  }

  if (input.type === "kosten") {
    await rememberSupplier(userId, input.leverancier, input.categorie, input.type);
  }

  return { error: null };
}

export async function deleteTransaction(transactionId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", transactionId);

  if (error) {
    return { error: "Verwijderen is mislukt. Probeer het opnieuw." };
  }

  return { error: null };
}
