import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  eachMonthOfInterval,
  format,
} from "date-fns";
import { nl } from "date-fns/locale";
import type { Aangiftetijdvak, Transaction } from "@/lib/types";

export type PeriodType = "maand" | "kwartaal" | "jaar";

export function getPeriodBounds(type: PeriodType, reference: Date = new Date()) {
  switch (type) {
    case "maand":
      return {
        start: startOfMonth(reference),
        end: endOfMonth(reference),
        label: format(reference, "MMMM yyyy", { locale: nl }),
      };
    case "jaar":
      return {
        start: startOfYear(reference),
        end: endOfYear(reference),
        label: format(reference, "yyyy"),
      };
    case "kwartaal":
    default:
      return {
        start: startOfQuarter(reference),
        end: endOfQuarter(reference),
        label: `Q${Math.floor(reference.getMonth() / 3) + 1} ${format(reference, "yyyy")}`,
      };
  }
}

export function defaultPeriodType(tijdvak: Aangiftetijdvak): PeriodType {
  return tijdvak;
}

export interface FinancialSnapshot {
  omzet: number;
  kosten: number;
  winst: number;
  btwSaldo: number;
  kostenPerCategorie: Record<string, number>;
}

export function aggregateTransactions(transactions: Transaction[]): FinancialSnapshot {
  let omzet = 0;
  let kosten = 0;
  let btwOntvangen = 0;
  let btwBetaald = 0;
  const kostenPerCategorie: Record<string, number> = {};

  for (const t of transactions) {
    if (t.type === "kosten") {
      kosten += t.bedrag_excl_btw;
      btwBetaald += t.btw_bedrag;
      kostenPerCategorie[t.categorie] = (kostenPerCategorie[t.categorie] ?? 0) + t.bedrag_excl_btw;
    } else {
      omzet += t.bedrag_excl_btw;
      btwOntvangen += t.btw_bedrag;
    }
  }

  return {
    omzet,
    kosten,
    winst: omzet - kosten,
    btwSaldo: btwOntvangen - btwBetaald,
    kostenPerCategorie,
  };
}

export interface MonthlyTrendPoint {
  label: string;
  omzet: number;
  kosten: number;
}

export function groupMonthlyTrend(transactions: Transaction[], monthsCount = 6): MonthlyTrendPoint[] {
  const now = new Date();
  const months = eachMonthOfInterval({ start: subMonths(now, monthsCount - 1), end: now });

  return months.map((month) => {
    const monthKey = format(month, "yyyy-MM");
    let omzet = 0;
    let kosten = 0;

    for (const t of transactions) {
      if (t.factuurdatum.slice(0, 7) !== monthKey) continue;
      if (t.type === "kosten") kosten += t.bedrag_excl_btw;
      else omzet += t.bedrag_excl_btw;
    }

    return { label: format(month, "MMM", { locale: nl }), omzet, kosten };
  });
}

export function btwUitlegzin(btwSaldo: number, periodeLabel: string): string {
  const bedrag = formatCurrencyPlain(Math.abs(btwSaldo));
  if (btwSaldo > 0) {
    return `Op basis van je facturen in ${periodeLabel} verwachten we dat je ongeveer ${bedrag} moet afdragen.`;
  }
  if (btwSaldo < 0) {
    return `Op basis van je facturen in ${periodeLabel} verwachten we dat je ongeveer ${bedrag} kunt terugvragen.`;
  }
  return `Op basis van je facturen in ${periodeLabel} verwachten we vooralsnog geen BTW-saldo.`;
}

function formatCurrencyPlain(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}
