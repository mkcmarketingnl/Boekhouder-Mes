import Link from "next/link";
import { FilePlus2, Settings, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { MigratieNotice } from "@/components/facturen/MigratieNotice";
import { laadFactuurContext } from "@/lib/facturenContext";
import { formatCurrency, formatDate } from "@/lib/format";
import { vandaagNl, type SalesInvoice } from "@/lib/facturen";
import { betaalStatus, openstaand } from "@/lib/betaling";

export default async function FacturenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { tabelOntbreekt, settings } = await laadFactuurContext(supabase, user!.id);

  const kolommen = "id, status, factuurnummer, klant_naam, factuurdatum, vervaldatum, totaal_incl, transaction_id";
  let data: unknown[] | null = [];
  if (!tabelOntbreekt) {
    // Met betaalstatus (migratie 0008); zonder die kolom valt de lijst terug op de oude weergave.
    const metBetaling = await supabase.from("sales_invoices").select((kolommen + ", betaald_op") as "*").eq("user_id", user!.id).order("created_at", { ascending: false });
    if (metBetaling.error) {
      const zonder = await supabase.from("sales_invoices").select(kolommen as "*").eq("user_id", user!.id).order("created_at", { ascending: false });
      data = zonder.data;
    } else {
      data = metBetaling.data;
    }
  }
  const facturen = (data ?? []) as Pick<SalesInvoice, "id" | "status" | "factuurnummer" | "klant_naam" | "factuurdatum" | "vervaldatum" | "totaal_incl" | "transaction_id" | "betaald_op">[];
  const vandaag = vandaagNl();
  const open = openstaand(facturen, vandaag);

  return (
    <div className="fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="display text-2xl font-semibold">Facturen</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">Maak je eigen facturen: kies een sjabloon, vul de gegevens in en laat de AI de BTW en eventuele fouten controleren.</p>
        </div>
        {!tabelOntbreekt && (
          <div className="flex w-full flex-col gap-2 min-[480px]:w-auto min-[480px]:flex-row">
            <Link href="/facturen/klanten" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-paper-dark">
              <Users size={15} /> Klanten
            </Link>
            <Link href="/facturen/instellingen" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold hover:bg-paper-dark">
              <Settings size={15} /> Instellingen
            </Link>
            <Link href={settings ? "/facturen/nieuw" : "/facturen/instellingen?terug=/facturen/nieuw"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-paper hover:opacity-90">
              <FilePlus2 size={15} /> Nieuwe factuur
            </Link>
          </div>
        )}
      </div>

      {!tabelOntbreekt && open.aantal > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[12px] text-muted">Nog te ontvangen</div>
              <div className="mono text-xl font-semibold">{formatCurrency(open.bedrag)}</div>
            </div>
            <div className="text-[12.5px] text-muted">
              {open.aantal} {open.aantal === 1 ? "factuur" : "facturen"} open
              {open.aantalTeLaat > 0 && <span className="text-stamp"> · {open.aantalTeLaat} te laat ({formatCurrency(open.bedragTeLaat)})</span>}
            </div>
          </div>
        </Card>
      )}

      {tabelOntbreekt ? (
        <MigratieNotice />
      ) : facturen.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-[14px] font-medium">Nog geen facturen</p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
            {settings ? "Maak je eerste factuur met de knop hierboven." : "Begin met het invullen van je bedrijfsgegevens en IBAN; dat doe je maar één keer."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {facturen.map((f) => (
            <li key={f.id}>
              <Link href={`/facturen/${f.id}`} className="block rounded-md border border-line bg-white p-4 hover:bg-paper-dark">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{f.klant_naam || "Naamloos"}</div>
                    <div className="mono mt-0.5 text-[11.5px] text-muted">
                      {f.status === "definitief" ? f.factuurnummer : "Concept"} · {formatDate(f.factuurdatum)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="mono text-[14px] font-semibold">{formatCurrency(Number(f.totaal_incl))}</div>
                    <div className={`mt-0.5 text-[11px] ${f.status === "concept" ? "text-warn" : betaalStatus(f, vandaag) === "te_laat" ? "text-stamp" : "text-ok"}`}>
                      {f.status === "concept"
                        ? "Concept"
                        : betaalStatus(f, vandaag) === "betaald"
                          ? "Betaald"
                          : betaalStatus(f, vandaag) === "te_laat"
                            ? "Te laat"
                            : "Open"}
                      {f.status === "definitief" && f.transaction_id ? " · in omzet" : ""}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
