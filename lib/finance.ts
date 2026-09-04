import {
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
  addMonths,
  addQuarters,
  subQuarters,
  addYears,
  subYears,
  eachMonthOfInterval,
  format,
} from "date-fns";
import { nl } from "date-fns/locale";
import { normalizeSupplierName } from "@/lib/types";
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

export function shiftPeriod(reference: Date, type: PeriodType, direction: 1 | -1): Date {
  switch (type) {
    case "maand":
      return direction === 1 ? addMonths(reference, 1) : subMonths(reference, 1);
    case "jaar":
      return direction === 1 ? addYears(reference, 1) : subYears(reference, 1);
    case "kwartaal":
    default:
      return direction === 1 ? addQuarters(reference, 1) : subQuarters(reference, 1);
  }
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

export interface RelatieSamenvatting {
  sleutel: string;
  naam: string;
  totaal: number;
  aantal: number;
  laatsteDatum: string;
}

export function groupByLeverancier(transactions: Transaction[], type: "kosten" | "omzet"): RelatieSamenvatting[] {
  // Groeperen op genormaliseerde naam (zelfde helper als het leveranciers-geheugen), anders
  // splitst dezelfde partij op in losse rijen door kleine schrijfverschillen (hoofdletters,
  // spaties) tussen facturen — en klopt de "exacte" totaalteller niet meer.
  const map = new Map<string, RelatieSamenvatting>();

  for (const t of transactions) {
    if (t.type !== type) continue;
    const key = normalizeSupplierName(t.leverancier) || t.leverancier;
    const bestaand = map.get(key);
    if (bestaand) {
      bestaand.totaal += t.bedrag_incl_btw;
      bestaand.aantal += 1;
      if (t.factuurdatum > bestaand.laatsteDatum) {
        bestaand.laatsteDatum = t.factuurdatum;
        bestaand.naam = t.leverancier;
      }
    } else {
      map.set(key, {
        sleutel: key,
        naam: t.leverancier,
        totaal: t.bedrag_incl_btw,
        aantal: 1,
        laatsteDatum: t.factuurdatum,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totaal - a.totaal);
}

export function btwUitlegzin(btwSaldo: number, periodeLabel: string): string {
  const bedrag = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Math.abs(btwSaldo)
  );
  if (btwSaldo > 0) {
    return `Op basis van je facturen in ${periodeLabel} verwachten we dat je ongeveer ${bedrag} moet afdragen.`;
  }
  if (btwSaldo < 0) {
    return `Op basis van je facturen in ${periodeLabel} verwachten we dat je ongeveer ${bedrag} kunt terugvragen.`;
  }
  return `Op basis van je facturen in ${periodeLabel} verwachten we vooralsnog geen BTW-saldo.`;
}
