import { cn } from "@/lib/utils";
import type { RisicoNiveau } from "@/lib/types";

const MAP: Record<RisicoNiveau, { bg: string; fg: string; label: string }> = {
  laag: { bg: "bg-ok-bg", fg: "text-ok", label: "Goedgekeurd" },
  midden: { bg: "bg-warn-bg", fg: "text-warn", label: "Controleer" },
  hoog: { bg: "bg-stamp-bg", fg: "text-stamp", label: "Geflagd" },
};

export function StatusBadge({ risico, className }: { risico: RisicoNiveau; className?: string }) {
  const s = MAP[risico];
  return (
    <span
      className={cn(
        "mono inline-block whitespace-nowrap rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
        s.bg,
        s.fg,
        className
      )}
    >
      {s.label}
    </span>
  );
}
