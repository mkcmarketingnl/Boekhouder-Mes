import { Card, CardHighlight } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  highlight,
  suffix,
  className,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
  suffix?: string;
  className?: string;
}) {
  const Wrapper = highlight ? CardHighlight : Card;
  return (
    <Wrapper className={cn("p-3.5", className)}>
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <span
          className={cn(
            "text-[11.5px] uppercase tracking-wide",
            highlight ? "text-paper/70" : "text-muted"
          )}
        >
          {label}
        </span>
      </div>
      <div className={cn("mono text-xl font-semibold", highlight ? "text-paper" : "text-ink")}>
        {formatCurrency(value)}
      </div>
      {suffix && (
        <div className={cn("mt-0.5 text-[10.5px]", highlight ? "text-paper/70" : "text-muted")}>{suffix}</div>
      )}
    </Wrapper>
  );
}
