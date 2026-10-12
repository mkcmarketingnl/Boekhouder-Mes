import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FactuurEditor } from "@/components/facturen/FactuurEditor";
import { MigratieNotice } from "@/components/facturen/MigratieNotice";
import { laadFactuurContext } from "@/lib/facturenContext";
import { bouwAfzender, vandaagNl, type SalesInvoice } from "@/lib/facturen";

// Een definitieve factuur aanpassen. Een concept bewerk je gewoon op /facturen/[id].
export default async function FactuurBewerkenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { tabelOntbreekt, settings, profiel } = await laadFactuurContext(supabase, user!.id, id);
  if (tabelOntbreekt) return <MigratieNotice />;

  const { data } = await supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle();
  const factuur = data as SalesInvoice | null;
  if (!factuur) notFound();
  if (factuur.status === "concept") redirect(`/facturen/${id}`);

  return (
    <div className="fade-in space-y-5">
      <div>
        <Link href={`/facturen/${id}`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Factuur {factuur.factuurnummer}
        </Link>
        <h1 className="display text-2xl font-semibold">Factuur {factuur.factuurnummer} aanpassen</h1>
      </div>
      <FactuurEditor
        bestaande={factuur}
        afzender={bouwAfzender(profiel, settings)}
        kor={factuur.kor}
        betaaltermijnDagen={settings?.betaaltermijn_dagen ?? 14}
        standaardTemplate={factuur.template}
        standaardNotitie={settings?.standaard_notitie ?? ""}
        nummerVoorbeeld={factuur.factuurnummer}
        vorigNummer={null}
        vandaag={vandaagNl()}
      />
    </div>
  );
}
