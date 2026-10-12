import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateInput } from "@/lib/format";
import { getPeriodBounds, shiftPeriod, type PeriodType } from "@/lib/finance";

export function PeriodNav({
  periodType,
  reference,
  basePath = "/dashboard",
}: {
  periodType: PeriodType;
  reference: Date;
  basePath?: string;
}) {
  const prevRef = shiftPeriod(reference, periodType, -1);
  const nextRef = shiftPeriod(reference, periodType, 1);
  const nextBounds = getPeriodBounds(periodType, nextRef);
  const isCurrentOrFuture = nextBounds.start > new Date();

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`${basePath}?periode=${periodType}&ref=${formatDateInput(prevRef)}`}
        aria-label="Vorige periode"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:text-ink"
      >
        <ChevronLeft size={18} />
      </Link>
      {isCurrentOrFuture ? (
        <span className="flex min-h-11 min-w-11 items-center justify-center text-line">
          <ChevronRight size={18} />
        </span>
      ) : (
        <Link
          href={`${basePath}?periode=${periodType}&ref=${formatDateInput(nextRef)}`}
          aria-label="Volgende periode"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted hover:text-ink"
        >
          <ChevronRight size={18} />
        </Link>
      )}
    </div>
  );
}
