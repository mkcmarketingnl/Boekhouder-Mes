import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { laadTransacties } from "@/lib/transactionsDb";
import { csvGetal, csvTekst, maakCsv } from "@/lib/csv";
import type { Transaction } from "@/lib/types";

// Alle boekingen van een jaar als CSV (opent in Excel). Alleen je eigen administratie; Money mode zit hier nooit in.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });

  const jaarTekst = request.nextUrl.searchParams.get("jaar") ?? "";
  const jaar = Number(jaarTekst);
  if (!/^\d{4}$/.test(jaarTekst) || jaar < 2000 || jaar > 2100) return NextResponse.json({ error: "Ongeldig jaar." }, { status: 400 });

  let transacties: Transaction[];
  try {
    transacties = await laadTransacties<Transaction>(supabase, user.id, { van: `${jaar}-01-01`, tot: `${jaar}-12-31` });
  } catch {
    return NextResponse.json({ error: "Laden is mislukt." }, { status: 500 });
  }
  transacties.sort((a, b) => (a.factuurdatum < b.factuurdatum ? -1 : a.factuurdatum > b.factuurdatum ? 1 : 0));

  const rijen = transacties.map((t) => [
    csvTekst(t.factuurdatum),
    csvTekst(t.type === "omzet" ? "Omzet" : "Kosten"),
    csvTekst(t.leverancier),
    csvTekst(t.factuurnummer),
    csvTekst(t.omschrijving),
    csvTekst(t.categorie),
    csvGetal(t.bedrag_excl_btw),
    csvGetal(t.btw_bedrag),
    csvGetal(t.bedrag_incl_btw),
    csvGetal(t.btw_percentage),
    csvTekst((t.btw_regels ?? []).map((r) => `${r.percentage}%: ${csvGetal(r.btw_bedrag)} BTW over ${csvGetal(r.bedrag_excl_btw)}`).join(" | ")),
  ]);

  const csv = maakCsv(["Datum", "Soort", "Leverancier of klant", "Factuurnummer", "Omschrijving", "Categorie", "Bedrag excl. BTW", "BTW-bedrag", "Bedrag incl. BTW", "BTW-percentage", "BTW-regels"], rijen);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="boekingen-${jaar}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
