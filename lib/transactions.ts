import { createClient } from "@/lib/supabase/client";
import { berekenExclBtw, hoofdPercentage, isGemengd, normaliseerRegels, totalenVanRegels, type BtwRegel } from "@/lib/btw";
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
  // Bij 2 of meer BTW-tarieven op één bon: de regels (dan zijn bedrag_incl_btw/btw_percentage afgeleid).
  btw_regels?: BtwRegel[] | null;
  type: TransactieType;
  categorie: string;
  risico: RisicoNiveau;
  risico_toelichting: string | null;
  invoerwijze: Invoerwijze;
}

// Eén plek waar de op te slaan bedragen worden bepaald, zodat opslaan en bewerken nooit uit elkaar lopen:
// bij 2+ BTW-tarieven zijn de totalen de som van de regels (elk in hele centen), anders één tarief over het totaal.
function bepaalBedragen(input: { bedrag_incl_btw: number; btw_percentage: number; btw_regels?: BtwRegel[] | null }) {
  if (isGemengd(input.btw_regels)) {
    const regels = normaliseerRegels(input.btw_regels);
    if (regels.length >= 2) {
      const t = totalenVanRegels(regels);
      return { incl: t.incl, excl: t.excl, btw: t.btw, percentage: hoofdPercentage(regels), regels };
    }
  }
  const { bedragExclBtw, btwBedrag } = berekenExclBtw(input.bedrag_incl_btw, input.btw_percentage);
  return { incl: input.bedrag_incl_btw, excl: bedragExclBtw, btw: btwBedrag, percentage: input.btw_percentage, regels: null as BtwRegel[] | null };
}

// Meerdere BTW-tarieven slaan we op in de kolom btw_regels (migratie 0005). Is die migratie nog niet
// uitgevoerd, dan is een duidelijke melding nuttiger dan een algemene "opslaan mislukt".
const MIGRATIE_NODIG =
  "Een bon met meerdere BTW-tarieven opslaan kan pas nadat de database-update (migratie 0005) is uitgevoerd in Supabase.";
function isMissendeKolom(error: { message?: string } | null): boolean {
  return !!error?.message && /btw_regels/i.test(error.message);
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
  const bedragen = bepaalBedragen(input);

  const { error } = await supabase.from("transactions").insert({
    document_id: input.document_id,
    user_id: userId,
    factuurnummer: input.factuurnummer,
    factuurdatum: input.factuurdatum,
    leverancier: input.leverancier,
    omschrijving: input.omschrijving,
    bedrag_incl_btw: bedragen.incl,
    bedrag_excl_btw: bedragen.excl,
    btw_bedrag: bedragen.btw,
    btw_percentage: bedragen.percentage,
    // alleen meesturen als het nodig is: zonder meerdere tarieven blijft opslaan werken op elke database-versie
    ...(bedragen.regels ? { btw_regels: bedragen.regels } : {}),
    type: input.type,
    categorie: input.categorie,
    risico: input.risico,
    risico_toelichting: input.risico_toelichting,
    invoerwijze: input.invoerwijze,
  });

  if (error) {
    if (bedragen.regels && isMissendeKolom(error)) return { error: MIGRATIE_NODIG };
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
  btw_regels?: BtwRegel[] | null;
  // true als de bestaande transactie meerdere BTW-tarieven had: dan wissen we die regels als het er nu één is
  hadBtwRegels?: boolean;
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
  const bedragen = bepaalBedragen(input);

  const { error } = await supabase
    .from("transactions")
    .update({
      factuurnummer: input.factuurnummer,
      factuurdatum: input.factuurdatum,
      leverancier: input.leverancier,
      omschrijving: input.omschrijving,
      bedrag_incl_btw: bedragen.incl,
      bedrag_excl_btw: bedragen.excl,
      btw_bedrag: bedragen.btw,
      btw_percentage: bedragen.percentage,
      ...(bedragen.regels ? { btw_regels: bedragen.regels } : input.hadBtwRegels ? { btw_regels: null } : {}),
      type: input.type,
      categorie: input.categorie,
    })
    .eq("id", transactionId);

  if (error) {
    if (isMissendeKolom(error)) return { error: MIGRATIE_NODIG };
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
