"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertCircle, Bell, X } from "lucide-react";
import type { Melding } from "@/lib/deadlines";

const SLEUTEL = "bm-weggeklikte-meldingen";
const GEBEURTENIS = "bm-meldingen-gewijzigd";

function leesRuw(): string {
  try {
    return window.localStorage.getItem(SLEUTEL) ?? "[]";
  } catch {
    return "[]";
  }
}

function abonneer(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(GEBEURTENIS, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(GEBEURTENIS, cb);
  };
}

function naarLijst(ruw: string): string[] {
  try {
    const lijst = JSON.parse(ruw);
    return Array.isArray(lijst) ? lijst.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Deadlines en dingen die openstaan, bovenaan je overzicht. Je kunt een melding wegklikken; die blijft dan weg (alleen in deze browser).
export function MeldingenBalk({ meldingen }: { meldingen: Melding[] }) {
  // Op de server (en tijdens hydratie) is er niets weggeklikt, zodat server en browser hetzelfde tonen.
  const ruw = useSyncExternalStore(abonneer, leesRuw, () => "[]");
  const weg = naarLijst(ruw);
  const zichtbaar = meldingen.filter((m) => !weg.includes(m.id));
  if (zichtbaar.length === 0) return null;

  function verberg(id: string) {
    const nieuw = [...new Set([...weg, id])].slice(-100);
    try {
      window.localStorage.setItem(SLEUTEL, JSON.stringify(nieuw));
      window.dispatchEvent(new Event(GEBEURTENIS));
    } catch {
      // zonder opslag kan een melding niet onthouden worden weggeklikt; dan blijft hij gewoon staan
    }
  }

  return (
    <ul className="space-y-2" aria-label="Meldingen">
      {zichtbaar.map((m) => (
        <li key={m.id} className={`flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${m.ernst === "te_laat" ? "border-stamp/25 bg-stamp-bg" : m.ernst === "let_op" ? "border-warn/30 bg-warn-bg" : "border-line bg-white"}`}>
          {m.ernst === "info" ? <Bell size={15} className="mt-0.5 shrink-0 text-muted" /> : <AlertCircle size={15} className={`mt-0.5 shrink-0 ${m.ernst === "te_laat" ? "text-stamp" : "text-warn"}`} />}
          <Link href={m.href} className="min-w-0 flex-1 py-1 hover:underline">
            {m.tekst}
          </Link>
          <button type="button" onClick={() => verberg(m.id)} className="-my-1 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted hover:text-ink" aria-label="Melding verbergen">
            <X size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
