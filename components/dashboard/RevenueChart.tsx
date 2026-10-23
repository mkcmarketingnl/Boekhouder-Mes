"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import type { MonthlyTrendPoint } from "@/lib/finance";

const COLOR_OMZET = "#3F6B4F";
const COLOR_KOSTEN = "#B8441E";
const COLOR_WINST = "#211F1C";
const INK_SECONDARY = "#75716A";
const GRIDLINE = "#E2DFD6";

// € 1.250 -> "€ 1,3k": kort genoeg om de as smal te houden, zodat de grafiek de ruimte krijgt
const kort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `€ ${(v / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}k`;
  return `€ ${Math.round(v)}`;
};

function Kerncijfer({ kleur, label, waarde }: { kleur: string; label: string; waarde: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: kleur }} />
        {label}
      </div>
      <div className="mono truncate text-[15px] font-semibold text-ink sm:text-[17px]">{formatCurrency(waarde)}</div>
    </div>
  );
}

// Omzet en kosten per maand als staafjes met de winst als lijn erover, en de totalen van de periode erboven:
// zo lees je in één blik zowel het verloop als de uitkomst.
export function RevenueChart({ data }: { data: MonthlyTrendPoint[] }) {
  const hasData = data.some((d) => d.omzet > 0 || d.kosten > 0);
  const punten = data.map((d) => ({ ...d, winst: Math.round((d.omzet - d.kosten) * 100) / 100 }));
  const totaalOmzet = data.reduce((a, d) => a + Math.round(d.omzet * 100), 0) / 100;
  const totaalKosten = data.reduce((a, d) => a + Math.round(d.kosten * 100), 0) / 100;

  return (
    <Card className="flex h-full flex-col p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="display text-[15px] font-semibold">Omzet versus kosten</h2>
        <span className="text-[11.5px] text-muted">laatste {data.length} maanden, excl. btw</span>
      </div>

      {!hasData ? (
        <div className="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-line px-4 text-center text-[13px] text-muted">
          Zodra je facturen of bonnen toevoegt, zie je hier je omzet, kosten en winst per maand.
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-3 border-b border-line pb-3">
            <Kerncijfer kleur={COLOR_OMZET} label="Omzet" waarde={totaalOmzet} />
            <Kerncijfer kleur={COLOR_KOSTEN} label="Kosten" waarde={totaalKosten} />
            <Kerncijfer kleur={COLOR_WINST} label="Winst" waarde={Math.round((totaalOmzet - totaalKosten) * 100) / 100} />
          </div>
          <div className="min-h-44 flex-1">
            <ResponsiveContainer width="100%" height="100%" minHeight={176}>
              <ComposedChart data={punten} barGap={3} margin={{ left: -8, right: 4, top: 6, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRIDLINE} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: INK_SECONDARY, fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={50} tick={{ fill: INK_SECONDARY, fontSize: 11 }} tickFormatter={kort} />
                <Tooltip
                  formatter={(value, naam) => [formatCurrency(Number(value)), String(naam)]}
                  contentStyle={{ borderRadius: 6, borderColor: GRIDLINE, fontSize: 13 }}
                  cursor={{ fill: "rgba(33,31,28,0.04)" }}
                />
                <Bar dataKey="omzet" name="Omzet" fill={COLOR_OMZET} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Bar dataKey="kosten" name="Kosten" fill={COLOR_KOSTEN} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Line dataKey="winst" name="Winst" type="linear" stroke={COLOR_WINST} strokeWidth={2} dot={{ r: 3, fill: COLOR_WINST }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
