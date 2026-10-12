import { Card } from "@/components/ui/Card";
import { MIGRATIE_MELDING } from "@/lib/facturen";

export function MigratieNotice() {
  return (
    <Card className="border-warn/30 bg-warn-bg p-5">
      <h2 className="display mb-1 text-[15px] font-semibold">Bijna klaar</h2>
      <p className="text-[13px] leading-relaxed">{MIGRATIE_MELDING} Zodra dat is gedaan werkt dit scherm meteen.</p>
    </Card>
  );
}
