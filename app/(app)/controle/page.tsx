import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ControleBeheer, type ControleDoc, type ControleRij } from "@/components/controle/ControleBeheer";
import { laadTransacties } from "@/lib/transactionsDb";
import { isTabelOntbreekt, vandaagNl } from "@/lib/facturen";

interface TxMetDoc {
  id: string;
  document_id: string | null;
  type: "kosten" | "omzet";
  leverancier: string;
  factuurdatum: string;
  bedrag_incl_btw: number;
  documents: { file_url: string } | { file_url: string }[] | null;
}

export default async function ControlePage({ searchParams }: { searchParams: Promise<{ jaar?: string }> }) {
  const { jaar: jaarParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const huidig = Number(vandaagNl().slice(0, 4));

  const header = (
    <div>
      <h1 className="display text-2xl font-semibold">Administratiecontrole</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">Controleer of wat je eerder hebt geüploade nog klopt met de originele documenten.</p>
    </div>
  );

  // Eerst kijken of de tabel er is (migratie 0010): zonder die tabel kunnen we geen uitkomsten bewaren.
  // (Geen HEAD-verzoek: dat geeft bij een ontbrekende tabel geen foutmelding terug.)
  const { error: tabelFout } = await supabase.from("document_controles").select("document_id").limit(1);
  if (tabelFout && isTabelOntbreekt(tabelFout)) {
    return (
      <div className="fade-in space-y-6">
        {header}
        <Card className="border-warn/30 bg-warn-bg p-5">
          <h2 className="display mb-1 text-[15px] font-semibold">Bijna klaar</h2>
          <p className="text-[13px] leading-relaxed">De administratiecontrole heeft een eenmalige database-update nodig (migratie 0010_document_controles.sql in Supabase). Zodra dat is gedaan werkt dit scherm meteen.</p>
        </Card>
      </div>
    );
  }

  const transacties = await laadTransacties<TxMetDoc>(supabase, user!.id, { select: "id, document_id, type, leverancier, factuurdatum, bedrag_incl_btw, documents(file_url)" });

  // Eén regel per document: de grootste boeking bepaalt hoe het document in de lijst heet
  const perDoc = new Map<string, TxMetDoc[]>();
  for (const t of transacties) {
    if (!t.document_id) continue;
    perDoc.set(t.document_id, [...(perDoc.get(t.document_id) ?? []), t]);
  }
  const alleDocs: (ControleDoc & { jaren: string[] })[] = [];
  for (const [documentId, txs] of perDoc) {
    const grootste = [...txs].sort((a, b) => Number(b.bedrag_incl_btw) - Number(a.bedrag_incl_btw))[0];
    const d = grootste.documents;
    const fileUrl = Array.isArray(d) ? d[0]?.file_url : d?.file_url;
    if (!fileUrl) continue;
    alleDocs.push({ documentId, fileUrl, titel: grootste.leverancier, datum: grootste.factuurdatum, bedrag: Number(grootste.bedrag_incl_btw), type: grootste.type, jaren: [...new Set(txs.map((t) => t.factuurdatum.slice(0, 4)))] });
  }
  alleDocs.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));

  const jaren = [...new Set(alleDocs.flatMap((d) => d.jaren))].sort().reverse();
  const gekozen = jaarParam === "alle" ? "alle" : jaarParam && jaren.includes(jaarParam) ? jaarParam : jaren.includes(String(huidig)) ? String(huidig) : (jaren[0] ?? "alle");
  const docs: ControleDoc[] = alleDocs.filter((d) => gekozen === "alle" || d.jaren.includes(gekozen)).map(({ jaren: _j, ...rest }) => (void _j, rest));

  // Bewaarde uitkomsten van deze documenten (in delen van 1.000, zodat er nooit iets wegvalt)
  const ids = new Set(docs.map((d) => d.documentId));
  const controles: ControleRij[] = [];
  for (let van = 0; van < 50000; van += 1000) {
    const { data } = await supabase.from("document_controles").select("*").eq("user_id", user!.id).order("document_id", { ascending: true }).range(van, van + 999);
    for (const r of (data ?? []) as ControleRij[]) if (ids.has(r.document_id)) controles.push(r);
    if (!data || data.length < 1000) break;
  }

  return (
    <div className="fade-in space-y-6">
      {header}
      {jaren.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Jaar">
          {[...jaren, "alle"].map((j) => (
            <Link key={j} href={`/controle?jaar=${j}`} aria-current={gekozen === j ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${gekozen === j ? "border-ink bg-ink text-paper" : "border-line bg-white text-muted hover:text-ink"}`}>
              {j === "alle" ? "Alle jaren" : j}
            </Link>
          ))}
        </div>
      )}
      <ControleBeheer key={gekozen} userId={user!.id} docs={docs} startControles={controles} />
    </div>
  );
}
