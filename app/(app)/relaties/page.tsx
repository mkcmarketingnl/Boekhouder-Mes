import { createClient } from "@/lib/supabase/server";
import { RelatiesView } from "@/components/relaties/RelatiesView";
import { groupByLeverancier } from "@/lib/finance";
import { normalizeSupplierName } from "@/lib/types";
import type { Transaction } from "@/lib/types";
import type { TransactionWithDoc } from "@/components/dashboard/TransactionDetailModal";

export default async function RelatiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("transactions")
    .select("*, documents(file_url)")
    .eq("user_id", user!.id)
    .order("factuurdatum", { ascending: false });

  const transacties = (data ?? []) as unknown as TransactionWithDoc[];

  const klanten = groupByLeverancier(transacties as unknown as Transaction[], "omzet");
  const leveranciers = groupByLeverancier(transacties as unknown as Transaction[], "kosten");

  const transactiesPerRelatie: Record<string, TransactionWithDoc[]> = {};
  for (const t of transacties) {
    const sleutel = normalizeSupplierName(t.leverancier) || t.leverancier;
    if (!transactiesPerRelatie[sleutel]) transactiesPerRelatie[sleutel] = [];
    transactiesPerRelatie[sleutel].push(t);
  }

  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="display text-2xl font-semibold">Klanten & Leveranciers</h1>
        <p className="mt-1 text-sm text-muted">Totalen per partij, over de hele geschiedenis.</p>
      </div>

      <RelatiesView klanten={klanten} leveranciers={leveranciers} transactiesPerRelatie={transactiesPerRelatie} />
    </div>
  );
}
