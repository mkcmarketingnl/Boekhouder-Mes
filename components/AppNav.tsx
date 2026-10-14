"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  label: string;
}

interface Groep {
  naam: string;
  items: Item[];
}

// Drie groepen met een submenu, plus Account. Zo blijft de balk op een telefoon bruikbaar terwijl er steeds meer onderdelen bijkomen.
const GROEPEN: Groep[] = [
  {
    naam: "Boekhouding",
    items: [
      { href: "/dashboard", label: "Overzicht" },
      { href: "/btw", label: "BTW" },
      { href: "/belasting", label: "Inkomstenbelasting" },
      { href: "/relaties", label: "Relaties" },
      { href: "/jaaroverzicht", label: "Jaaroverzicht" },
    ],
  },
  {
    naam: "Werk",
    items: [
      { href: "/facturen", label: "Facturen" },
      { href: "/uren", label: "Uren" },
    ],
  },
  { naam: "Persoonlijk", items: [{ href: "/geld", label: "Geld" }] },
];

const ACCOUNT = { href: "/account", label: "Account" };

const isActief = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

const scrollRij = "mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 sm:gap-1.5 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function AppNav() {
  const pathname = usePathname();
  const actieveGroep = GROEPEN.find((g) => g.items.some((i) => isActief(pathname, i.href)));
  const opAccount = isActief(pathname, ACCOUNT.href);

  return (
    <nav aria-label="Hoofdmenu" className="border-b border-line bg-paper/95">
      <div className={cn(scrollRij, "py-2")}>
        {GROEPEN.map((g) => {
          const actief = g === actieveGroep;
          return (
            <Link
              key={g.naam}
              href={g.items[0].href}
              aria-current={actief ? "true" : undefined}
              className={cn("flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-[13.5px] font-semibold sm:px-4 sm:text-sm", actief ? "bg-ink text-paper" : "text-muted hover:text-ink")}
            >
              {g.naam}
            </Link>
          );
        })}
        <Link
          href={ACCOUNT.href}
          aria-current={opAccount ? "page" : undefined}
          className={cn("flex min-h-11 shrink-0 items-center rounded-full px-2.5 text-[13.5px] font-semibold sm:px-4 sm:text-sm", opAccount ? "bg-ink text-paper" : "text-muted hover:text-ink")}
        >
          {ACCOUNT.label}
        </Link>
      </div>

      {actieveGroep && actieveGroep.items.length > 1 && (
        <div className="border-t border-line/70">
          <div className={cn(scrollRij, "py-1")}>
            {actieveGroep.items.map((item) => {
              const actief = isActief(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={actief ? "page" : undefined}
                  className={cn("flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[13px] font-medium", actief ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
