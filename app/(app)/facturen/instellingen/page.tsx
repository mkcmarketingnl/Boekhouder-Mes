import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { InstellingenForm, type InstellingenStart } from "@/components/facturen/InstellingenForm";
import { MigratieNotice } from "@/components/facturen/MigratieNotice";
import { laadFactuurContext } from "@/lib/facturenContext";

export default async function InstellingenPage({ searchParams }: { searchParams: Promise<{ terug?: string }> }) {
  const { terug } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { tabelOntbreekt, settings, profiel } = await laadFactuurContext(supabase, user!.id);

  // Alleen interne terugverwijzingen toestaan
  const terugNaar = terug && terug.startsWith("/facturen") ? terug : "/facturen";

  const start: InstellingenStart = {
    bedrijfsnaam: profiel.bedrijfsnaam,
    adres: settings?.adres ?? "",
    postcode: settings?.postcode ?? "",
    plaats: settings?.plaats ?? "",
    land: settings?.land ?? "Nederland",
    iban: settings?.iban ?? "",
    bic: settings?.bic ?? "",
    telefoon: settings?.telefoon ?? "",
    email: settings?.email ?? user!.email ?? "",
    website: settings?.website ?? "",
    kvk_nummer: profiel.kvk_nummer ?? "",
    btw_nummer: profiel.btw_nummer ?? "",
    betaaltermijn_dagen: settings?.betaaltermijn_dagen ?? 14,
    factuurnummer_prefix: settings?.factuurnummer_prefix ?? `${new Date().getFullYear()}-`,
    volgend_factuurnummer: settings?.volgend_factuurnummer ?? 1,
    standaard_template: settings?.standaard_template ?? "klassiek",
    standaard_notitie: settings?.standaard_notitie ?? "",
    kor: settings?.kor ?? false,
  };

  return (
    <div className="fade-in space-y-5">
      <div>
        <Link href="/facturen" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Facturen
        </Link>
        <h1 className="display text-2xl font-semibold">Factuurinstellingen</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">Eén keer invullen: je bedrijfsgegevens, IBAN en hoe je facturen genummerd worden.</p>
      </div>
      {tabelOntbreekt ? <MigratieNotice /> : <InstellingenForm start={start} terugNaar={terugNaar} />}
    </div>
  );
}
