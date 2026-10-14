import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { JaaroverzichtActies } from "@/components/jaaroverzicht/JaaroverzichtActies";
import { aggregateTransactions, groupByLeverancier } from "@/lib/finance";
import { berekenAangifte, type AangifteTransactie } from "@/lib/btwAangifte";
import { laadIbAntwoorden } from "@/lib/belastingDb";
import { estimateIncomeTax } from "@/lib/tax";
import { ibStappen } from "@/lib/belasting";
import { laadTransacties } from "@/lib/transactionsDb";
import { laadJaarUrenSplit } from "@/lib/urenDb";
import { betaalStatus, openstaand } from "@/lib/betaling";
import { formatUren } from "@/lib/uren";
import { vandaagNl } from "@/lib/facturen";
import { formatCurrency } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

const e = (n: number) => formatCurrency(n);

function Rij({ label, waarde, vet = false, gedempt = false }: { label: string; waarde: string; vet?: boolean; gedempt?: boolean }) {
  return (
    <li className={`flex items-baseline justify-between gap-3 py-1.5 text-[13px] ${vet ? "font-semibold" : ""} ${gedempt ? "text-muted" : ""}`}>
      <span>{label}</span>
      <span className="mono shrink-0">{waarde}</span>
    </li>
  );
}

export default async function JaaroverzichtPage({ searchParams }: { searchParams: Promise<{ jaar?: string }> }) {
  const { jaar: jaarParam } = await searchParams;
  const vandaag = vandaagNl();
  const huidig = Number(vandaag.slice(0, 4));
  const jaar = jaarParam && /^\d{4}$/.test(jaarParam) && Number(jaarParam) >= 2020 && Number(jaarParam) <= huidig ? Number(jaarParam) : huidig;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
  const profile = profileRow as Profile;

  const transacties = await laadTransacties<Transaction>(supabase, user!.id, { van: `${jaar}-01-01`, tot: `${jaar}-12-31` });
  const snap = aggregateTransactions(transacties);
  const aangifte = berekenAangifte(transacties as unknown as AangifteTransactie[]);
  const klanten = groupByLeverancier(transacties, "omzet").slice(0, 10);
  const leveranciers = groupByLeverancier(transacties, "kosten").slice(0, 10);
  const categorieen = Object.entries(snap.kostenPerCategorie).sort((a, b) => b[1] - a[1]);

  const [{ antwoorden }, uren] = await Promise.all([laadIbAntwoorden(supabase, user!.id, jaar), laadJaarUrenSplit(supabase, user!.id, jaar)]);
  const belasting = estimateIncomeTax(profile.rechtsvorm, snap.winst, antwoorden, jaar);

  // Eigen facturen van dit jaar (alleen als de factuurmaker is ingericht)
  const factuurQuery = (kolommen: string) =>
    supabase.from("sales_invoices").select(kolommen as "*").eq("user_id", user!.id).eq("status", "definitief").gte("factuurdatum", `${jaar}-01-01`).lte("factuurdatum", `${jaar}-12-31`);
  let { data: facturenRij, error: factuurFout } = await factuurQuery("status, vervaldatum, totaal_incl, factuurdatum, betaald_op");
  if (factuurFout) ({ data: facturenRij, error: factuurFout } = await factuurQuery("status, vervaldatum, totaal_incl, factuurdatum")); // vóór migratie 0008
  const metBetaalkolom = !factuurFout && facturenRij != null;
  const facturen = (facturenRij ?? []).map((f) => ({ status: "definitief" as const, vervaldatum: f.vervaldatum as string, totaal_incl: Number(f.totaal_incl), betaald_op: f.betaald_op as string | null }));
  const openFacturen = openstaand(facturen, vandaag);
  const aantalBetaald = facturen.filter((f) => betaalStatus(f, vandaag) === "betaald").length;

  return (
    <div className="fade-in space-y-6">
      <div className="print:hidden">
        <h1 className="display text-2xl font-semibold">Jaaroverzicht</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">Alles van een jaar op één plek, voor je aangifte of je boekhouder. Je privé-gegevens uit Money mode staan hier niet in.</p>
      </div>

      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/jaaroverzicht?jaar=${jaar - 1}`} aria-label="Vorig jaar" className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-white hover:bg-paper-dark ${jaar <= 2020 ? "pointer-events-none opacity-40" : ""}`}>
          <ChevronLeft size={16} />
        </Link>
        <span className="text-[15px] font-semibold">{jaar}</span>
        <Link href={`/jaaroverzicht?jaar=${jaar + 1}`} aria-label="Volgend jaar" className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-white hover:bg-paper-dark ${jaar >= huidig ? "pointer-events-none opacity-40" : ""}`}>
          <ChevronRight size={16} />
        </Link>
      </div>

      <JaaroverzichtActies jaar={jaar} />

      <div id="jaaroverzicht-print" className="space-y-5 bg-paper">
        <div>
          <h2 className="display text-xl font-semibold">
            {profile.bedrijfsnaam} — jaaroverzicht {jaar}
          </h2>
          <p className="text-[12px] text-muted">
            Gemaakt op {vandaag} · alle bedragen excl. BTW tenzij anders vermeld · {transacties.length} boekingen
            {jaar === huidig ? " · het jaar is nog niet afgelopen" : ""}
          </p>
        </div>

        <Card className="p-4">
          <h3 className="display mb-1 text-[14px] font-semibold">Samenvatting</h3>
          <ul className="divide-y divide-line">
            <Rij label="Omzet" waarde={e(snap.omzet)} />
            <Rij label="Kosten" waarde={e(snap.kosten)} />
            <Rij label="Winst" waarde={e(snap.winst)} vet />
            <Rij label={snap.btwSaldo >= 0 ? "BTW-saldo (te betalen)" : "BTW-saldo (terug te vragen)"} waarde={e(Math.abs(snap.btwSaldo))} />
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="display mb-1 text-[14px] font-semibold">BTW per rubriek</h3>
          <ul className="divide-y divide-line">
            {Object.values(aangifte.rubrieken)
              .filter((r) => (r.grondslag ?? 0) !== 0 || (r.btw ?? 0) !== 0)
              .map((r) => (
                <Rij key={r.code} label={`Rubriek ${r.code} — omzet ${e(r.grondslag ?? 0)}`} waarde={`BTW ${e(r.btw ?? 0)}`} />
              ))}
            <Rij label="5a Verschuldigde omzetbelasting" waarde={e(aangifte.verschuldigd)} gedempt />
            <Rij label="5b Voorbelasting" waarde={e(aangifte.voorbelasting)} gedempt />
            <Rij label="5c Saldo (5a min 5b)" waarde={e(aangifte.subtotaal)} vet />
          </ul>
          {aangifte.nietAftrekbaar.btw > 0 && <p className="mt-2 text-[11.5px] text-muted">Niet meegerekend: {e(aangifte.nietAftrekbaar.btw)} BTW op horeca en representatie, die niet aftrekbaar is.</p>}
        </Card>

        {categorieen.length > 0 && (
          <Card className="p-4">
            <h3 className="display mb-1 text-[14px] font-semibold">Kosten per categorie</h3>
            <ul className="divide-y divide-line">
              {categorieen.map(([naam, bedrag]) => (
                <Rij key={naam} label={naam} waarde={e(bedrag)} />
              ))}
            </ul>
          </Card>
        )}

        {(klanten.length > 0 || leveranciers.length > 0) && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 print:grid-cols-2">
            {klanten.length > 0 && (
              <Card className="p-4">
                <h3 className="display mb-1 text-[14px] font-semibold">Grootste klanten</h3>
                <ul className="divide-y divide-line">
                  {klanten.map((k) => (
                    <Rij key={k.sleutel} label={k.naam} waarde={e(k.totaalExcl)} />
                  ))}
                </ul>
              </Card>
            )}
            {leveranciers.length > 0 && (
              <Card className="p-4">
                <h3 className="display mb-1 text-[14px] font-semibold">Grootste leveranciers</h3>
                <ul className="divide-y divide-line">
                  {leveranciers.map((k) => (
                    <Rij key={k.sleutel} label={k.naam} waarde={e(k.totaalExcl)} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        {belasting.van_toepassing && belasting.details && (
          <Card className="p-4">
            <h3 className="display mb-1 text-[14px] font-semibold">Inkomstenbelasting (indicatie)</h3>
            <ul className="divide-y divide-line">
              {ibStappen(belasting.details).map((s) => (
                <Rij key={s.sleutel} label={s.label} waarde={s.bedrag < 0 ? `− ${e(-s.bedrag)}` : e(s.bedrag)} vet={["belastbareWinst", "totaal"].includes(s.sleutel)} />
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              {belasting.persoonlijk ? "Gebaseerd op je antwoorden in de inkomstenbelasting-modus." : "Gebaseerd op de standaardaannames; beantwoord de vragen in de inkomstenbelasting-modus voor een nauwkeuriger bedrag."} Een schatting, geen aangifte.
            </p>
          </Card>
        )}
        {belasting.van_toepassing && !belasting.details && (
          <Card className="p-4">
            <h3 className="display mb-1 text-[14px] font-semibold">Vennootschapsbelasting (indicatie)</h3>
            <ul className="divide-y divide-line">
              <Rij label="Geschat" waarde={e(belasting.bedrag)} vet />
            </ul>
            <p className="mt-2 text-[11.5px] text-muted">{belasting.toelichting}</p>
          </Card>
        )}

        {uren.beschikbaar && uren.totaalMinuten > 0 && (
          <Card className="p-4">
            <h3 className="display mb-1 text-[14px] font-semibold">Uren</h3>
            <ul className="divide-y divide-line">
              <Rij label="Totaal gewerkt" waarde={formatUren(uren.totaalMinuten / 60)} vet />
              <Rij label="Waarvan factureerbaar" waarde={formatUren(uren.factureerbaarMinuten / 60)} />
              <Rij label="Overig (administratie, acquisitie, ...)" waarde={formatUren((uren.totaalMinuten - uren.factureerbaarMinuten) / 60)} />
              <Rij label="Urencriterium (1.225 uur)" waarde={uren.totaalMinuten / 60 >= 1225 ? "gehaald" : "niet gehaald"} gedempt />
            </ul>
          </Card>
        )}

        {metBetaalkolom && facturen.length > 0 && (
          <Card className="p-4">
            <h3 className="display mb-1 text-[14px] font-semibold">Facturen die je met de app maakte</h3>
            <ul className="divide-y divide-line">
              <Rij label="Aantal definitieve facturen" waarde={String(facturen.length)} />
              <Rij label="Waarvan betaald" waarde={String(aantalBetaald)} />
              <Rij label="Nog niet betaald (incl. BTW)" waarde={`${e(openFacturen.bedrag)}${openFacturen.aantalTeLaat > 0 ? ` · ${openFacturen.aantalTeLaat} te laat` : ""}`} />
            </ul>
          </Card>
        )}

        <p className="text-[11px] leading-relaxed text-muted">Dit overzicht is gemaakt uit de gegevens die je in Boekhouder Mes hebt toegevoegd. Het is een hulpmiddel en geen officiële aangifte of boekhoudkundig advies. Controleer cijfers voordat je ze gebruikt.</p>
      </div>
    </div>
  );
}
