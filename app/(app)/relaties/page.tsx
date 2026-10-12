import { createClient } from "@/lib/supabase/server";
import { RelatiesView } from "@/components/relaties/RelatiesView";
import { aggregateTransactions, groupByLeverancier } from "@/lib/finance";
import { normalizeSupplierName } from "@/lib/types";
import type { Transaction } from "@/lib/types";
import type { TransactionWithDoc } from "@/components/dashboard/TransactionDetailModal";

export default async function RelatiesPage({ searchParams }: { searchParams: Promise<{ jaar?: string }> }) {
  const { jaar } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("transactions")
    .select("*, documents(file_url)")
    .eq("user_id", user!.id)
    .order("factuurdatum", { ascending: false });

  const alle = (data ?? []) as unknown as TransactionWithDoc[];

  // Standaard het lopende jaar, precies zoals de "Jaar"-weergave op het dashboard — zo staan de
  // totalen hier naast dezelfde cijfers die je daar ziet.
  const huidigJaar = String(new Date().getFullYear());
  const jaren = Array.from(new Set([huidigJaar, ...alle.map((t) => t.factuurdatum.slice(0, 4))])).sort().reverse();
  const gekozen = jaar === "alle" ? "alle" : jaren.includes(jaar ?? "") ? (jaar as string) : huidigJaar;

  const transacties = gekozen === "alle" ? alle : alle.filter((t) => t.factuurdatum.startsWith(`${gekozen}-`));

  const totalen = aggregateTransactions(transacties as unknown as Transaction[]);
  const klanten = groupByLeverancier(transacties as unknown as Transaction[], "omzet");
  const leveranciers = groupByLeverancier(transacties as unknown as Transaction[], "kosten");

  // Vangnet: de som van alle klanten móét gelijk zijn aan de omzet, en die van alle leveranciers aan de
  // kosten (beide excl. BTW). Door de gedeelde optelling kan dit niet uit elkaar lopen; mocht iemand dit
  // ooit stukmaken, dan zie je het meteen in de logs i.p.v. dat de boekhouding stilletjes afwijkt.
  const cent = (n: number) => Math.round(n * 100);
  const somKlanten = klanten.reduce((a, k) => a + cent(k.totaalExcl), 0);
  const somLeveranciers = leveranciers.reduce((a, l) => a + cent(l.totaalExcl), 0);
  if (somKlanten !== cent(totalen.omzet) || somLeveranciers !== cent(totalen.kosten)) {
    console.error("Relaties-totalen wijken af van dashboard-totalen", {
      jaar: gekozen,
      somKlanten,
      omzet: cent(totalen.omzet),
      somLeveranciers,
      kosten: cent(totalen.kosten),
    });
  }

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
        <p className="mt-1 text-sm text-muted">Totalen per partij, exclusief btw — net als op je dashboard.</p>
      </div>

      <RelatiesView
        klanten={klanten}
        leveranciers={leveranciers}
        transactiesPerRelatie={transactiesPerRelatie}
        totaalOmzet={totalen.omzet}
        totaalKosten={totalen.kosten}
        jaren={jaren}
        gekozenJaar={gekozen}
      />
    </div>
  );
}
