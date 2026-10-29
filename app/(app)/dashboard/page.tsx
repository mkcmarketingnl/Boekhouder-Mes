import Link from "next/link";
import { TrendingUp, TrendingDown, PiggyBank, Receipt } from "lucide-react";
import { subMonths } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { UploadFlow } from "@/components/documents/UploadFlow";
import { StatCard } from "@/components/dashboard/StatCard";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { PeriodNav } from "@/components/dashboard/PeriodNav";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { DocumentsList } from "@/components/dashboard/DocumentsList";
import { Pagination } from "@/components/dashboard/Pagination";
import { TaxEstimateCard } from "@/components/dashboard/TaxEstimateCard";
import { FiscalTips } from "@/components/dashboard/FiscalTips";
import { DASHBOARD_DISCLAIMER } from "@/components/ui/Disclaimer";
import {
  aggregateTransactions,
  btwUitlegzin,
  getPeriodBounds,
  groupMonthlyTrend,
  type PeriodType,
} from "@/lib/finance";
import { schatBelasting } from "@/lib/belastingDb";
import { laadTransacties } from "@/lib/transactionsDb";
import { laadMeldingen } from "@/lib/deadlinesDb";
import { MeldingenBalk } from "@/components/dashboard/MeldingenBalk";
import { vandaagNl } from "@/lib/facturen";
import { formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";
import type { TransactionWithDoc } from "@/components/dashboard/TransactionDetailModal";

const PAGE_SIZE = 5;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; ref?: string; pagina?: string }>;
}) {
  const { periode, ref, pagina } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user!.id)
    .single();
  const profile = profileRow as Profile;

  const periodType: PeriodType = ["maand", "kwartaal", "jaar"].includes(periode ?? "")
    ? (periode as PeriodType)
    : profile.aangiftetijdvak;

  const reference = ref && !isNaN(Date.parse(ref)) ? new Date(ref) : new Date();
  const page = Math.max(1, Number(pagina) || 1);

  const { start, end, label } = getPeriodBounds(periodType, reference);
  const isCurrentPeriod = start.getTime() === getPeriodBounds(periodType, new Date()).start.getTime();
  const trendStart = subMonths(new Date(), 5);
  const { start: yearStart, end: yearEnd } = getPeriodBounds("jaar");

  const [
    { data: periodTransactions },
    { data: trendTransactions },
    { data: pagedTransactions, count },
    { data: yearTransactions },
  ] = await Promise.all([
    laadTransacties(supabase, user!.id, { van: formatDateInput(start), tot: formatDateInput(end) }).then((data) => ({ data })),
    laadTransacties(supabase, user!.id, { van: formatDateInput(trendStart) }).then((data) => ({ data })),
    (async () => {
      const pagina = (zonderIngehouden: boolean) => {
        const q = supabase
          .from("transactions")
          .select("*, documents(file_url)", { count: "exact" })
          .eq("user_id", user!.id)
          .gte("factuurdatum", formatDateInput(start))
          .lte("factuurdatum", formatDateInput(end));
        return (zonderIngehouden ? q.is("ingehouden_op", null) : q).order("factuurdatum", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      };
      const eerst = await pagina(true);
      // Zonder migratie 0011 bestaat de kolom niet: dan gewoon alles tonen
      return eerst.error && /ingehouden_op/i.test(eerst.error.message) ? await pagina(false) : eerst;
    })(),
    laadTransacties(supabase, user!.id, { van: formatDateInput(yearStart), tot: formatDateInput(yearEnd) }).then((data) => ({ data })),
  ]);

  const snapshot = aggregateTransactions((periodTransactions ?? []) as Transaction[]);
  const trend = groupMonthlyTrend((trendTransactions ?? []) as Transaction[]);
  const rows = (pagedTransactions ?? []) as unknown as TransactionWithDoc[];
  // Ingehouden kosten (factoring e.d.) staan bij hun factuur: haal ze op voor de facturen op deze pagina
  if (rows.length > 0) {
    const { data: ingehouden, error: ingehoudenFout } = await supabase.from("transactions").select("*").eq("user_id", user!.id).in("ingehouden_op", rows.map((r) => r.id));
    if (!ingehoudenFout) {
      for (const r of rows) r.ingehouden = ((ingehouden ?? []) as Transaction[]).filter((k) => k.ingehouden_op === r.id);
    }
  }
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const yearSnapshot = aggregateTransactions((yearTransactions ?? []) as Transaction[]);
  const meldingen = await laadMeldingen(supabase, user!.id, profile.aangiftetijdvak, vandaagNl());
  const taxEstimate = await schatBelasting(supabase, user!.id, profile.rechtsvorm, yearSnapshot.winst, new Date().getFullYear());

  function buildDashboardHref(overrides: { periode?: string; ref?: string; pagina?: number }) {
    const params = new URLSearchParams();
    params.set("periode", overrides.periode ?? periodType);
    if (overrides.ref ?? ref) params.set("ref", overrides.ref ?? ref!);
    params.set("pagina", String(overrides.pagina ?? 1));
    return `/dashboard?${params.toString()}`;
  }

  return (
    <div className="fade-in space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-xl font-semibold sm:text-2xl">Welkom terug, {profile.voornaam}</h1>
          <Link href="/onboarding" className="text-xs text-muted underline">
            profiel bewerken
          </Link>
        </div>
        <UploadFlow userId={user!.id} defaultBtwPercentage={profile.standaard_btw_percentage} />
      </div>

      <MeldingenBalk meldingen={meldingen} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector active={periodType} />
        <div className="flex items-center gap-1">
          <PeriodNav periodType={periodType} reference={reference} />
          <p className="min-w-[7rem] text-right text-xs text-muted">{label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Omzet" suffix="excl. btw" value={snapshot.omzet} icon={<TrendingUp size={15} className="text-ok" />} />
        <StatCard label="Kosten" suffix="excl. btw" value={snapshot.kosten} icon={<TrendingDown size={15} className="text-stamp" />} />
        <StatCard label="Winst" suffix={snapshot.omzet > 0 ? `excl. btw · ${Math.round((snapshot.winst / snapshot.omzet) * 100)}% van omzet` : "excl. btw"} value={snapshot.winst} icon={<PiggyBank size={15} className="text-paper/70" />} highlight />
        <StatCard
          label={`BTW-saldo (${periodType})`}
          value={Math.abs(snapshot.btwSaldo)}
          icon={<Receipt size={15} className="text-warn" />}
          suffix={snapshot.btwSaldo >= 0 ? "te betalen" : "terug te vragen"}
        />
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted">{btwUitlegzin(snapshot.btwSaldo, label)}</p>

      {/* Grafiek en belasting naast elkaar, zo hoog als elkaar; daaronder de documenten en de tips. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={trend} />
        </div>
        <TaxEstimateCard estimate={taxEstimate} jaar={new Date().getFullYear()} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="display mb-3 text-[15px] font-semibold">
            Documenten {isCurrentPeriod ? "" : `— ${label}`} <span className="text-xs font-normal text-muted">(bedragen incl. btw)</span>
          </h2>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">
              {isCurrentPeriod
                ? "Nog niets geüpload. Scan je eerste bon of factuur om te beginnen."
                : "Geen transacties in deze periode."}
            </div>
          ) : (
            <>
              <DocumentsList rows={rows} highlightFirst={isCurrentPeriod && page === 1} />
              <Pagination
                page={page}
                totalPages={totalPages}
                buildHref={(p) => buildDashboardHref({ pagina: p })}
              />
            </>
          )}
        </div>
        <div>
          <FiscalTips />
        </div>
      </div>

      <p className="pt-1 text-[11px] leading-relaxed text-muted">{DASHBOARD_DISCLAIMER}</p>
    </div>
  );
}
