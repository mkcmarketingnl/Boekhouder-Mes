"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { bedragNaarTekst, parseBedrag } from "@/lib/decimal";

// Tekstveld voor een getal dat met komma of punt getypt mag worden. Houdt de getypte tekst vast (zodat "87," niet
// meteen "87" wordt) en geeft het getal door; verandert de waarde van buitenaf, dan volgt de tekst.
export function DecimalInput({
  value,
  onValueChange,
  placeholder,
  "aria-label": ariaLabel,
  className,
}: {
  value: number;
  onValueChange: (n: number) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [staat, setStaat] = useState({ tekst: bedragNaarTekst(value), waarde: value });
  if (value !== staat.waarde) setStaat({ tekst: bedragNaarTekst(value), waarde: value });

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder ?? "0,00"}
      value={staat.tekst}
      onChange={(e) => {
        const n = parseBedrag(e.target.value);
        if (n === null) return; // letters e.d. negeren
        setStaat({ tekst: e.target.value, waarde: n });
        onValueChange(n);
      }}
    />
  );
}
