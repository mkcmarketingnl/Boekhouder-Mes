import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Input";
import { formatCurrency, berekenExclBtw } from "@/lib/format";

const BTW_OPTIES = [21, 9, 0];

export function AmountFields({
  bedragInclBtw,
  btwPercentage,
  onBedragChange,
  onPercentageChange,
}: {
  bedragInclBtw: string;
  btwPercentage: number;
  onBedragChange: (v: string) => void;
  onPercentageChange: (v: number) => void;
}) {
  const totaal = Number(bedragInclBtw) || 0;
  const { bedragExclBtw, btwBedrag } = berekenExclBtw(totaal, btwPercentage);

  return (
    <div className="mb-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Totaalbedrag incl. BTW">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={bedragInclBtw}
            onChange={(e) => onBedragChange(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label="BTW-percentage">
          <Select value={btwPercentage} onChange={(e) => onPercentageChange(Number(e.target.value))}>
            {BTW_OPTIES.map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-md border border-line bg-paper-dark p-3.5 text-[13px]">
        <div className="mono flex justify-between text-ink">
          <span>Bedrag excl. BTW</span>
          <span>{totaal > 0 ? formatCurrency(bedragExclBtw) : "—"}</span>
        </div>
        <div className="mono mt-1.5 flex justify-between text-muted">
          <span>BTW-bedrag</span>
          <span>{totaal > 0 ? formatCurrency(btwBedrag) : "—"}</span>
        </div>
      </div>
    </div>
  );
}
