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
import { estimateIncomeTax } from "@/lib/tax";
import { formatDateInput } from "@/lib/format";
import type { AiTip, Profile, Transaction } from "@/lib/types";
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
    { data: tipsRows },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user!.id)
      .gte("factuurdatum", formatDateInput(start))
      .lte("factuurdatum", formatDateInput(end)),
    supabase.from("transactions").select("*").eq("user_id", user!.id).gte("factuurdatum", formatDateInput(trendStart)),
    supabase
      .from("transactions")
      .select("*, documents(file_url)", { count: "exact" })
      .eq("user_id", user!.id)
      .gte("factuurdatum", formatDateInput(start))
      .lte("factuurdatum", formatDateInput(end))
      .order("factuurdatum", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user!.id)
      .gte("factuurdatum", formatDateInput(yearStart))
      .lte("factuurdatum", formatDateInput(yearEnd)),
    supabase
      .from("ai_tips")
      .select("*")
      .eq("user_id", user!.id)
      .order("gegenereerd_op", { ascending: false })
      .limit(5),
  ]);

  const snapshot = aggregateTransactions((periodTransactions ?? []) as Transaction[]);
  const trend = groupMonthlyTrend((trendTransactions ?? []) as Transaction[]);
  const rows = (pagedTransactions ?? []) as unknown as TransactionWithDoc[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const yearSnapshot = aggregateTransactions((yearTransactions ?? []) as Transaction[]);
  const taxEstimate = estimateIncomeTax(profile.rechtsvorm, yearSnapshot.winst);
  const tips = (tipsRows ?? []) as AiTip[];

  function buildDashboardHref(overrides: { periode?: string; ref?: string; pagina?: number }) {
    const params = new URLSearchParams();
    params.set("periode", overrides.periode ?? periodType);
    if (overrides.ref ?? ref) params.set("ref", overrides.ref ?? ref!);
    params.set("pagina", String(overrides.pagina ?? 1));
    return `/dashboard?${params.toString()}`;
  }

  return (
    <div className="fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl font-semibold">Welkom terug, {profile.voornaam}</h1>
          <Link href="/onboarding" className="mt-1 inline-block text-xs text-muted underline">
            profiel bewerken
          </Link>
        </div>
        <UploadFlow userId={user!.id} defaultBtwPercentage={profile.standaard_btw_percentage} />
      </div>

      <p className="rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
        {DASHBOARD_DISCLAIMER}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector active={periodType} />
        <div className="flex items-center gap-1">
          <PeriodNav periodType={periodType} reference={reference} />
          <p className="min-w-[7rem] text-right text-xs text-muted">{label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Omzet" value={snapshot.omzet} icon={<TrendingUp size={15} className="text-ok" />} />
        <StatCard label="Kosten" value={snapshot.kosten} icon={<TrendingDown size={15} className="text-stamp" />} />
        <StatCard label="Winst" value={snapshot.winst} icon={<PiggyBank size={15} className="text-paper/70" />} highlight />
        <StatCard
          label={`BTW-saldo (${periodType})`}
          value={Math.abs(snapshot.btwSaldo)}
          icon={<Receipt size={15} className="text-warn" />}
          suffix={snapshot.btwSaldo >= 0 ? "te betalen" : "terug te vragen"}
        />
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted">{btwUitlegzin(snapshot.btwSaldo, label)}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <TaxEstimateCard estimate={taxEstimate} jaar={new Date().getFullYear()} />
        <FiscalTips tips={tips} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <RevenueChart data={trend} />
        <div>
          <h2 className="display mb-3 text-[15px] font-semibold">
            Documenten {isCurrentPeriod ? "" : `— ${label}`}
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
      </div>
    </div>
  );
}
