import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FactuurEditor } from "@/components/facturen/FactuurEditor";
import { FactuurDocument } from "@/components/facturen/FactuurDocument";
import { FactuurActies } from "@/components/facturen/FactuurActies";
import { MigratieNotice } from "@/components/facturen/MigratieNotice";
import { laadFactuurContext } from "@/lib/facturenContext";
import { bouwAfzender, formatFactuurnummer, type FactuurGegevens, type SalesInvoice } from "@/lib/facturen";

export default async function FactuurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { tabelOntbreekt, settings, profiel, vorigNummer } = await laadFactuurContext(supabase, user!.id, id);
  if (tabelOntbreekt) return <MigratieNotice />;

  const { data } = await supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle();
  const factuur = data as SalesInvoice | null;
  if (!factuur) notFound();

  const terug = (
    <Link href="/facturen" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink print:hidden">
      <ArrowLeft size={14} /> Facturen
    </Link>
  );

  if (factuur.status === "concept") {
    return (
      <div className="fade-in space-y-5">
        <div>
          {terug}
          <h1 className="display text-2xl font-semibold">Concept bewerken</h1>
        </div>
        <FactuurEditor
          bestaande={factuur}
          afzender={bouwAfzender(profiel, settings)}
          kor={settings?.kor ?? factuur.kor}
          betaaltermijnDagen={settings?.betaaltermijn_dagen ?? 14}
          standaardTemplate={settings?.standaard_template ?? "klassiek"}
          standaardNotitie={settings?.standaard_notitie ?? ""}
          nummerVoorbeeld={settings ? formatFactuurnummer(settings.factuurnummer_prefix, settings.volgend_factuurnummer) : "—"}
          vorigNummer={vorigNummer}
          vandaag={new Date().toISOString().slice(0, 10)}
        />
      </div>
    );
  }

  // Definitief: toon de factuur zoals hij is vastgelegd (afzender en BTW-instellingen uit het moment van definitief maken).
  const afzender = factuur.afzender ?? bouwAfzender(profiel, settings);
  const gegevens: FactuurGegevens = {
    factuurnummer: factuur.factuurnummer,
    klant_naam: factuur.klant_naam,
    klant_adres: factuur.klant_adres,
    klant_postcode: factuur.klant_postcode,
    klant_plaats: factuur.klant_plaats,
    klant_land: factuur.klant_land,
    klant_btw_nummer: factuur.klant_btw_nummer,
    klant_kvk: factuur.klant_kvk,
    factuurdatum: factuur.factuurdatum,
    vervaldatum: factuur.vervaldatum,
    leverdatum: factuur.leverdatum,
    regels: factuur.regels,
    btw_verlegd: factuur.btw_verlegd,
    kor: factuur.kor,
    notitie: factuur.notitie,
  };

  return (
    <div className="fade-in space-y-5">
      <div className="print:hidden">
        {terug}
        <h1 className="display text-2xl font-semibold">Factuur {factuur.factuurnummer}</h1>
        <p className="mt-1 text-sm text-muted">Definitief — deze factuur kan niet meer worden gewijzigd.</p>
      </div>
      <FactuurDocument gegevens={gegevens} afzender={afzender} template={factuur.template} />
      <FactuurActies id={factuur.id} geboekt={!!factuur.transaction_id} controle={factuur.ai_controle} />
    </div>
  );
}
