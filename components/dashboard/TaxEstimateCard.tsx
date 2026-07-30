import { Landmark } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { BELASTING_INDICATIE_DISCLAIMER } from "@/components/ui/Disclaimer";
import type { TaxEstimate } from "@/lib/tax";

export function TaxEstimateCard({ estimate, jaar }: { estimate: TaxEstimate; jaar: number }) {
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <Landmark size={16} className="text-stamp" />
        <h2 className="display text-[15px] font-semibold">Reservering belasting {jaar}</h2>
      </div>
      {estimate.van_toepassing ? (
        <>
          <div className="mono text-2xl font-semibold text-ink">{formatCurrency(estimate.bedrag)}</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{estimate.toelichting}</p>
        </>
      ) : (
        <p className="text-[13px] text-muted">{estimate.toelichting}</p>
      )}
      <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
        Dit telt automatisch mee bij elke factuur die je toevoegt, gebaseerd op je winst dit hele
        kalenderjaar. {BELASTING_INDICATIE_DISCLAIMER}
      </p>
    </Card>
  );
}
