"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Overzicht" },
  { href: "/facturen", label: "Facturen" },
  { href: "/btw", label: "BTW" },
  { href: "/relaties", label: "Relaties" },
  { href: "/account", label: "Account" },
];

// Tabbalk onder de kop. Op een smal scherm scrolt de rij zijwaarts i.p.v. dat de koptekst overloopt.
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Hoofdmenu" className="border-b border-line bg-paper/95">
      <div className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map((item) => {
          const actief = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={actief ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold",
                actief ? "bg-ink text-paper" : "text-muted hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
