import { createClient } from "@/lib/supabase/client";
import { berekenExclBtw } from "@/lib/format";
import type { Invoerwijze, RisicoNiveau, TransactieType } from "@/lib/types";

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

  return { error: null };
}
