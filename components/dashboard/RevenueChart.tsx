"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import type { MonthlyTrendPoint } from "@/lib/finance";

const COLOR_OMZET = "#3F6B4F";
const COLOR_KOSTEN = "#B8441E";
const INK_SECONDARY = "#75716A";
const GRIDLINE = "#E2DFD6";

export function RevenueChart({ data }: { data: MonthlyTrendPoint[] }) {
  const hasData = data.some((d) => d.omzet > 0 || d.kosten > 0);

  return (
    <Card className="p-5">
      <h2 className="display mb-3 text-[15px] font-semibold">Omzet versus kosten (6 maanden)</h2>
      {!hasData ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted">
          Nog geen gegevens om weer te geven.
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={4} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke={GRIDLINE} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: INK_SECONDARY, fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fill: INK_SECONDARY, fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 6, borderColor: GRIDLINE, fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: INK_SECONDARY }} />
              <Bar dataKey="omzet" name="Omzet" fill={COLOR_OMZET} radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="kosten" name="Kosten" fill={COLOR_KOSTEN} radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
