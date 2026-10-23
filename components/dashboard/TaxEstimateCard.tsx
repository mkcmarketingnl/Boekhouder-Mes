import Link from "next/link";
import { ChevronDown, Landmark } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { BELASTING_INDICATIE_DISCLAIMER } from "@/components/ui/Disclaimer";
import type { TaxEstimate } from "@/lib/tax";

// Compact: het bedrag, wat het van je winst is, waar het uit bestaat en een link naar de berekening. De uitleg en de
// disclaimer staan ingeklapt, zodat het blokje niet langer is dan de grafiek ernaast.
export function TaxEstimateCard({ estimate, jaar }: { estimate: TaxEstimate; jaar: number }) {
  const d = estimate.details;
  const percentage = d && d.winst > 0 ? d.effectiefPercentage : null;

  return (
    <Card className="flex h-full flex-col p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Landmark size={16} className="text-stamp" />
        <h2 className="display text-[15px] font-semibold">Belasting reserveren {jaar}</h2>
      </div>

      {estimate.van_toepassing ? (
        <>
          <div className="mono text-[26px] font-semibold leading-tight text-ink">{formatCurrency(estimate.bedrag)}</div>

          {percentage !== null && (
            <div className="mt-2.5">
              <div className="h-2 overflow-hidden rounded-full bg-paper-dark" role="img" aria-label={`${String(percentage).replace(".", ",")}% van je winst`}>
                <div className="h-full rounded-full bg-stamp" style={{ width: `${Math.min(100, Math.max(2, percentage))}%` }} />
              </div>
              <p className="mt-1.5 text-[12px] text-muted">{String(percentage).replace(".", ",")}% van je winst dit jaar</p>
            </div>
          )}

          {d && (
            <dl className="mono mt-3 space-y-1 border-t border-line pt-3 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Inkomstenbelasting</dt>
                <dd>{formatCurrency(d.nettoIb)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Zvw-bijdrage</dt>
                <dd>{formatCurrency(d.zvwBijdrage)}</dd>
              </div>
            </dl>
          )}

          <div className="mt-auto pt-3">
            {d && (
              <Link href="/belasting" className="inline-flex min-h-11 items-center text-[12.5px] font-medium text-ink underline">
                Berekening en bespaartips
              </Link>
            )}
            <details className="group text-[11.5px] leading-relaxed text-muted">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                <ChevronDown size={13} className="transition-transform group-open:rotate-180" /> Over deze schatting
              </summary>
              <p className="pb-1">{estimate.toelichting}</p>
              <p className="pb-1">Dit telt automatisch mee bij elke factuur die je toevoegt, gebaseerd op je winst dit hele kalenderjaar. {BELASTING_INDICATIE_DISCLAIMER}</p>
            </details>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted">{estimate.toelichting}</p>
      )}
    </Card>
  );
}
