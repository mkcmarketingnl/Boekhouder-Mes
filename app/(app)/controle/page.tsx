import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ControleBeheer, type ControleDoc, type ControleRij } from "@/components/controle/ControleBeheer";
import { laadTransacties } from "@/lib/transactionsDb";
import { isTabelOntbreekt, vandaagNl } from "@/lib/facturen";
import { alleKeuzes, inPeriode, standaardPeriode, vindPeriode, periodeOpties } from "@/lib/controlePeriodes";
import { snelleControles, type SnelleTx } from "@/lib/snelleControles";
import { txUitRij } from "@/lib/administratiecontrole";
import type { Profile } from "@/lib/types";

interface TxRij {
  id: string;
  document_id: string | null;
  type: "kosten" | "omzet";
  leverancier: string;
  factuurnummer: string | null;
  factuurdatum: string;
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  btw_percentage: number;
  btw_regels: { percentage: number; bedrag_incl_btw: number }[] | null;
  categorie: string;
  invoerwijze: "ai" | "handmatig";
  ingehouden_op?: string | null;
  documents: { file_url: string } | { file_url: string }[] | null;
}

const KOLOMMEN = "id, document_id, type, leverancier, factuurnummer, factuurdatum, bedrag_incl_btw, bedrag_excl_btw, btw_bedrag, btw_percentage, btw_regels, categorie, invoerwijze, documents(file_url)";

export default async function ControlePage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const { periode: periodeParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const vandaag = vandaagNl();
  const { data: profileRij } = await supabase.from("profiles").select("aangiftetijdvak").eq("user_id", user!.id).single();
  const tijdvak = (profileRij as Pick<Profile, "aangiftetijdvak"> | null)?.aangiftetijdvak ?? "kwartaal";

  const header = (
    <div>
      <h1 className="display text-2xl font-semibold">Administratiecontrole</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">Controleer per tijdvak of wat je hebt opgeslagen klopt met de originele documenten, bijvoorbeeld vlak voor je BTW-aangifte.</p>
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

  // Alle boekingen; zonder migratie 0011 bestaat de kolom ingehouden_op nog niet
  let transacties: TxRij[];
  try {
    transacties = await laadTransacties<TxRij>(supabase, user!.id, { select: KOLOMMEN + ", ingehouden_op" });
  } catch {
    transacties = await laadTransacties<TxRij>(supabase, user!.id, { select: KOLOMMEN });
  }

  // Het jaar waarin je boekingen staan bepaalt welke jaren je kunt kiezen
  const jaren = [...new Set(transacties.map((t) => t.factuurdatum.slice(0, 4)))];
  const keuzes = alleKeuzes(tijdvak, vandaag, jaren);
  const gekozen = vindPeriode(keuzes, periodeParam) ?? vindPeriode(keuzes, standaardPeriode(periodeOpties(tijdvak, vandaag)))!;

  // Eén regel per document: de grootste boeking (zonder ingehouden kosten) bepaalt hoe het document heet
  const perDoc = new Map<string, TxRij[]>();
  for (const t of transacties) if (t.document_id) perDoc.set(t.document_id, [...(perDoc.get(t.document_id) ?? []), t]);
  const docs: ControleDoc[] = [];
  for (const [documentId, txs] of perDoc) {
    if (!txs.some((t) => inPeriode(t.factuurdatum, gekozen) || gekozen.sleutel === "alle")) continue;
    const hoofd = [...txs].filter((t) => !t.ingehouden_op).sort((a, b) => Number(b.bedrag_incl_btw) - Number(a.bedrag_incl_btw))[0] ?? txs[0];
    const d = hoofd.documents;
    const fileUrl = Array.isArray(d) ? d[0]?.file_url : d?.file_url;
    if (!fileUrl) continue;
    docs.push({ documentId, fileUrl, titel: hoofd.leverancier, datum: hoofd.factuurdatum, bedrag: Number(hoofd.bedrag_incl_btw), type: hoofd.type, txs: txs.map(txUitRij) });
  }
  docs.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));

  // Bewaarde uitkomsten (in delen van 1.000, zodat er nooit iets wegvalt); met de bewaarde scan als migratie 0011 is gedraaid
  const ids = new Set(docs.map((d) => d.documentId));
  const controles: ControleRij[] = [];
  for (let van = 0; van < 50000; van += 1000) {
    const { data } = await supabase.from("document_controles").select("*").eq("user_id", user!.id).order("document_id", { ascending: true }).range(van, van + 999);
    for (const r of (data ?? []) as ControleRij[]) if (ids.has(r.document_id)) controles.push({ ...r, scan: r.scan ?? null });
    if (!data || data.length < 1000) break;
  }
  // Is de kolom `scan` er? Zo niet, dan kunnen oude uitkomsten niet opnieuw berekend worden (migratie 0011).
  const { error: scanKolomFout } = await supabase.from("document_controles").select("scan").limit(1);
  const heeftScanKolom = !scanKolomFout;

  // Snelle controles op de boekingen van dit tijdvak
  const inTijdvak = transacties.filter((t) => gekozen.sleutel === "alle" || inPeriode(t.factuurdatum, gekozen));
  const snelle: SnelleTx[] = inTijdvak.map((t) => ({
    id: t.id,
    type: t.type,
    leverancier: t.leverancier,
    factuurnummer: t.factuurnummer,
    factuurdatum: t.factuurdatum,
    bedrag_incl_btw: Number(t.bedrag_incl_btw),
    categorie: t.categorie,
    btw_percentage: Number(t.btw_percentage),
    heeftBtwRegels: Array.isArray(t.btw_regels) && t.btw_regels.length >= 2,
    invoerwijze: t.invoerwijze,
    document_id: t.document_id,
    ingehouden_op: t.ingehouden_op ?? null,
  }));

  return (
    <div className="fade-in space-y-6">
      {header}
      <ControleBeheer
        key={gekozen.sleutel}
        userId={user!.id}
        tijdvak={tijdvak}
        keuzes={keuzes.map((k) => ({ sleutel: k.sleutel, label: k.label, isAangifte: !!k.isAangifte }))}
        gekozen={{ sleutel: gekozen.sleutel, label: gekozen.label, begin: gekozen.begin, isAangifte: !!gekozen.isAangifte }}
        docs={docs}
        startControles={controles}
        heeftScanKolom={heeftScanKolom}
        snel={snelleControles(snelle)}
        aantalBoekingen={inTijdvak.length}
      />
    </div>
  );
}
