import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FactuurEditor } from "@/components/facturen/FactuurEditor";
import { MigratieNotice } from "@/components/facturen/MigratieNotice";
import { laadFactuurContext } from "@/lib/facturenContext";
import { bouwAfzender, formatFactuurnummer, vandaagNl } from "@/lib/facturen";

export default async function NieuweFactuurPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { tabelOntbreekt, settings, profiel, vorigNummer } = await laadFactuurContext(supabase, user!.id);

  if (!tabelOntbreekt && !settings) redirect("/facturen/instellingen?terug=/facturen/nieuw");

  return (
    <div className="fade-in space-y-5">
      <div>
        <Link href="/facturen" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Facturen
        </Link>
        <h1 className="display text-2xl font-semibold">Nieuwe factuur</h1>
      </div>
      {tabelOntbreekt || !settings ? (
        <MigratieNotice />
      ) : (
        <FactuurEditor
          bestaande={null}
          afzender={bouwAfzender(profiel, settings)}
          kor={settings.kor}
          betaaltermijnDagen={settings.betaaltermijn_dagen}
          standaardTemplate={settings.standaard_template}
          standaardNotitie={settings.standaard_notitie ?? ""}
          nummerVoorbeeld={formatFactuurnummer(settings.factuurnummer_prefix, settings.volgend_factuurnummer)}
          vorigNummer={vorigNummer}
          vandaag={vandaagNl()}
        />
      )}
    </div>
  );
}
