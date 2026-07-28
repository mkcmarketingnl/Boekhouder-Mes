"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BTW_INDICATIE_DISCLAIMER } from "@/components/ui/Disclaimer";
import { cn } from "@/lib/utils";

interface Suggestie {
  percentage: 21 | 9 | 0;
  vrijgesteld: boolean;
  toelichting: string;
}

const OPTIES: { percentage: 21 | 9 | 0; vrijgesteld: boolean; label: string }[] = [
  { percentage: 21, vrijgesteld: false, label: "21%" },
  { percentage: 9, vrijgesteld: false, label: "9%" },
  { percentage: 0, vrijgesteld: true, label: "Vrijgesteld" },
];

export function BtwSuggestion({
  activiteiten,
  value,
  onChange,
}: {
  activiteiten: string;
  value: { percentage: number; vrijgesteld: boolean };
  onChange: (v: { percentage: number; vrijgesteld: boolean }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestie, setSuggestie] = useState<Suggestie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  async function bepaal() {
    if (activiteiten.trim().length < 3) {
      setError("Beschrijf eerst kort je bedrijfsactiviteiten hierboven.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/btw-suggestie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activiteiten }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Kon geen BTW-tarief bepalen. Kies hieronder handmatig.");
        setTouched(true);
        return;
      }
      setSuggestie(json.data);
      setTouched(true);
      onChange({ percentage: json.data.percentage, vrijgesteld: json.data.vrijgesteld });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-5">
      {!touched && (
        <Button type="button" variant="secondary" onClick={bepaal} loading={loading} className="w-full justify-center">
          <Sparkles size={15} />
          Bepaal mijn BTW-tarief
        </Button>
      )}

      {loading && (
        <div className="scan-frame slide-down mt-3 flex items-center gap-2 rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] text-ink">
          <Loader2 size={14} className="spin" /> Je activiteiten worden geanalyseerd...
        </div>
      )}

      {error && <p className="mt-2 text-xs text-stamp">{error}</p>}

      {touched && !loading && (
        <div className="slide-down mt-3 rounded-md border border-line bg-paper-dark p-3.5">
          {suggestie && (
            <>
              <p className="text-[13px] leading-relaxed text-ink">
                Op basis van je activiteiten verwachten we dat je meestal{" "}
                <strong>{value.vrijgesteld ? "vrijgesteld van BTW" : `${value.percentage}% BTW`}</strong> rekent.
                Klopt dit?
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{suggestie.toelichting}</p>
            </>
          )}
          {!suggestie && (
            <p className="text-[13px] leading-relaxed text-ink">Kies het BTW-tarief dat het best bij je past.</p>
          )}
          <div className="mt-3 flex gap-2">
            {OPTIES.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => onChange({ percentage: opt.percentage, vrijgesteld: opt.vrijgesteld })}
                className={cn(
                  "min-h-11 flex-1 rounded-md border px-2 text-sm font-semibold",
                  value.percentage === opt.percentage && value.vrijgesteld === opt.vrijgesteld
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-white text-ink"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">{BTW_INDICATIE_DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}
