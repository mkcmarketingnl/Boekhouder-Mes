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
import { isVoorbelastingAftrekbaar, naarCenten } from "@/lib/btw";
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
  // BTW op kosten die je NIET kunt terugvragen (bijv. eten/drinken in de horeca); telt niet mee in btwSaldo.
  nietAftrekbareBtw: number;
  kostenPerCategorie: Record<string, number>;
}

export function aggregateTransactions(transactions: Transaction[]): FinancialSnapshot {
  // Alles in hele centen optellen en pas aan het eind terug naar euro's: zo geeft het dashboard en
  // elke andere lijst (bijv. Klanten & Leveranciers) altijd exact dezelfde totalen.
  let omzet = 0;
  let kosten = 0;
  let btwOntvangen = 0;
  let btwBetaald = 0;
  let nietAftrekbaar = 0;
  const kostenPerCategorieCenten: Record<string, number> = {};

  for (const t of transactions) {
    const excl = Math.round(t.bedrag_excl_btw * 100);
    const btw = Math.round(t.btw_bedrag * 100);
    if (t.type === "kosten") {
      kosten += excl;
      if (isVoorbelastingAftrekbaar(t)) btwBetaald += btw;
      else nietAftrekbaar += btw;
      kostenPerCategorieCenten[t.categorie] = (kostenPerCategorieCenten[t.categorie] ?? 0) + excl;
    } else {
      omzet += excl;
      btwOntvangen += btw;
    }
  }

  const kostenPerCategorie: Record<string, number> = {};
  for (const [categorie, centen] of Object.entries(kostenPerCategorieCenten)) {
    kostenPerCategorie[categorie] = centen / 100;
  }

  return {
    omzet: omzet / 100,
    kosten: kosten / 100,
    winst: (omzet - kosten) / 100,
    btwSaldo: (btwOntvangen - btwBetaald) / 100,
    nietAftrekbareBtw: nietAftrekbaar / 100,
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
      if (t.type === "kosten") kosten += naarCenten(t.bedrag_excl_btw);
      else omzet += naarCenten(t.bedrag_excl_btw);
    }

    return { label: format(month, "MMM", { locale: nl }), omzet: omzet / 100, kosten: kosten / 100 };
  });
}

export interface RelatieSamenvatting {
  sleutel: string;
  naam: string;
  // Excl. BTW = dezelfde maatstaf als Omzet/Kosten op het dashboard (aggregateTransactions); incl. BTW
  // is wat er daadwerkelijk is gefactureerd/betaald. Beide in hele centen opgeteld, zodat er nooit
  // afrondingsverschillen ontstaan tussen deze lijst en het dashboard.
  totaalExcl: number;
  totaalIncl: number;
  aantal: number;
  laatsteDatum: string;
}

export function groupByLeverancier(transactions: Transaction[], type: "kosten" | "omzet"): RelatieSamenvatting[] {
  // Groeperen op genormaliseerde naam (zelfde helper als het leveranciers-geheugen), anders
  // splitst dezelfde partij op in losse rijen door kleine schrijfverschillen (hoofdletters,
  // spaties) tussen facturen.
  const map = new Map<string, { s: RelatieSamenvatting; excl: number; incl: number }>();

  for (const t of transactions) {
    if (t.type !== type) continue;
    const key = normalizeSupplierName(t.leverancier) || t.leverancier;
    const bestaand = map.get(key);
    if (bestaand) {
      bestaand.excl += naarCenten(t.bedrag_excl_btw);
      bestaand.incl += naarCenten(t.bedrag_incl_btw);
      bestaand.s.aantal += 1;
      if (t.factuurdatum > bestaand.s.laatsteDatum) {
        bestaand.s.laatsteDatum = t.factuurdatum;
        bestaand.s.naam = t.leverancier;
      }
    } else {
      map.set(key, {
        s: { sleutel: key, naam: t.leverancier, totaalExcl: 0, totaalIncl: 0, aantal: 1, laatsteDatum: t.factuurdatum },
        excl: naarCenten(t.bedrag_excl_btw),
        incl: naarCenten(t.bedrag_incl_btw),
      });
    }
  }

  return Array.from(map.values())
    .map(({ s, excl, incl }) => ({ ...s, totaalExcl: excl / 100, totaalIncl: incl / 100 }))
    .sort((x, y) => y.totaalExcl - x.totaalExcl);
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
