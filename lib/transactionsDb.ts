import type { SupabaseClient } from "@supabase/supabase-js";

const PAGINA = 1000; // PostgREST geeft standaard maximaal 1000 rijen per verzoek

// Haalt ALLE transacties van een periode op, 1000 tegelijk. Zonder dit zou je bij meer dan 1000 boekingen stilletjes een
// afgekapte lijst krijgen en dus een verkeerde omzet, winst en BTW. Bij een databasefout gooien we liever een fout dan
// dat we met een onvolledige lijst doorrekenen.
export async function laadTransacties<T = unknown>(
  supabase: SupabaseClient,
  userId: string,
  opties: { van?: string; tot?: string; select?: string } = {}
): Promise<T[]> {
  const rijen: T[] = [];
  for (let van = 0; van < 200000; van += PAGINA) {
    let q = supabase.from("transactions").select((opties.select ?? "*") as "*").eq("user_id", userId);
    if (opties.van) q = q.gte("factuurdatum", opties.van);
    if (opties.tot) q = q.lte("factuurdatum", opties.tot);
    const { data, error } = await q.order("factuurdatum", { ascending: false }).order("id", { ascending: true }).range(van, van + PAGINA - 1);
    if (error) {
      console.error("Transacties laden mislukt:", error.message);
      throw new Error("Transacties laden mislukt");
    }
    rijen.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return rijen;
}
