import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <Link
        href={buildHref(page - 1)}
        aria-disabled={page <= 1}
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line text-ink",
          page <= 1 && "pointer-events-none opacity-40"
        )}
      >
        <ChevronLeft size={16} />
      </Link>
      <span className="text-xs text-muted">
        Pagina {page} van {totalPages}
      </span>
      <Link
        href={buildHref(page + 1)}
        aria-disabled={page >= totalPages}
        className={cn(
          "flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line text-ink",
          page >= totalPages && "pointer-events-none opacity-40"
        )}
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}
