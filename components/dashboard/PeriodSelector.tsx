import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@/lib/finance";

const OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "maand", label: "Maand" },
  { value: "kwartaal", label: "Kwartaal" },
  { value: "jaar", label: "Jaar" },
];

export function PeriodSelector({ active }: { active: PeriodType }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-white p-1">
      {OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={`/dashboard?periode=${opt.value}`}
          className={cn(
            "min-h-9 rounded-full px-3.5 py-1.5 text-sm font-semibold leading-6",
            active === opt.value ? "bg-ink text-paper" : "text-muted"
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
