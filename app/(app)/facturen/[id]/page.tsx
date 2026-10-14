import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FactuurEditor } from "@/components/facturen/FactuurEditor";
import { FactuurDocument } from "@/components/facturen/FactuurDocument";
import { FactuurActies } from "@/components/facturen/FactuurActies";
import { MigratieNotice } from "@/components/facturen/MigratieNotice";
import { laadFactuurContext } from "@/lib/facturenContext";
import { laadKlanten } from "@/lib/klantenDb";
import { formatDate } from "@/lib/format";
import { BetalingPaneel } from "@/components/facturen/BetalingPaneel";
import { betaalStatus, dagenTeLaat, herinneringTekst } from "@/lib/betaling";
import { bouwAfzender, formatFactuurnummer, vandaagNl, type FactuurGegevens, type SalesInvoice } from "@/lib/facturen";

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
    const { beschikbaar: klantenBeschikbaar, klanten } = await laadKlanten(supabase, user!.id);
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
          vandaag={vandaagNl()}
          klanten={klanten}
          klantenBeschikbaar={klantenBeschikbaar}
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
        <p className="mt-1 text-sm text-muted">
          Definitief{factuur.gewijzigd_op ? ` · aangepast op ${formatDate(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(factuur.gewijzigd_op)))}` : ""}
          {factuur.eerdere_versies && factuur.eerdere_versies.length > 0 ? ` · ${factuur.eerdere_versies.length} eerdere ${factuur.eerdere_versies.length === 1 ? "versie" : "versies"} bewaard` : ""}
        </p>
      </div>
      <FactuurDocument gegevens={gegevens} afzender={afzender} template={factuur.template} />
      <BetalingPaneel
        id={factuur.id}
        status={betaalStatus(factuur, vandaagNl())}
        dagenTeLaat={dagenTeLaat(factuur, vandaagNl())}
        vervaldatum={factuur.vervaldatum}
        betaaldOp={factuur.betaald_op ?? null}
        laatsteHerinneringOp={factuur.laatste_herinnering_op ?? null}
        vandaag={vandaagNl()}
        herinnering={
          betaalStatus(factuur, vandaagNl()) === "te_laat"
            ? herinneringTekst(
                {
                  klant_naam: factuur.klant_naam,
                  factuurnummer: factuur.factuurnummer,
                  factuurdatum: factuur.factuurdatum,
                  vervaldatum: factuur.vervaldatum,
                  totaal_incl: Number(factuur.totaal_incl),
                  bedrijfsnaam: afzender.bedrijfsnaam,
                  iban: afzender.iban,
                  eerderHerinnerd: !!factuur.laatste_herinnering_op,
                },
                vandaagNl()
              )
            : null
        }
      />
      <FactuurActies id={factuur.id} geboekt={!!factuur.transaction_id} controle={factuur.ai_controle} />
    </div>
  );
}
