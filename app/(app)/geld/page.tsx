import { createClient } from "@/lib/supabase/server";
import { laadTransacties } from "@/lib/transactionsDb";
import { Card } from "@/components/ui/Card";
import { GeldBeheer } from "@/components/geld/GeldBeheer";
import { aggregateTransactions, getPeriodBounds } from "@/lib/finance";
import { laadGeld, laadVerplichtingen } from "@/lib/geldDb";
import { dagenVoorbijInJaar, inkomenUitAdministratie } from "@/lib/geldInkomen";
import { vandaagNl } from "@/lib/facturen";
import { formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

export default async function GeldPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const vandaag = vandaagNl();
  const jaar = Number(vandaag.slice(0, 4));

  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
  const profile = profileRow as Profile;
  const gegevens = await laadGeld(supabase, user!.id, vandaag);

  const header = (
    <div>
      <h1 className="display text-2xl font-semibold">Geld</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">Je privé-overzicht: wat komt er binnen, wat gaat er vast uit, wat los je af en wat blijft er over voor de dingen die je leuk vindt en voor je doelen. Alleen voor jou zichtbaar.</p>
    </div>
  );

  if (!gegevens.beschikbaar) {
    return (
      <div className="fade-in space-y-6">
        {header}
        <Card className="border-warn/30 bg-warn-bg p-5">
          <h2 className="display mb-1 text-[15px] font-semibold">Bijna klaar</h2>
          <p className="text-[13px] leading-relaxed">Money mode heeft een eenmalige database-update nodig (migratie 0008_uren_belasting_geld.sql in Supabase). Zodra dat is gedaan werkt dit scherm meteen.</p>
        </Card>
      </div>
    );
  }

  const { start, end } = getPeriodBounds("jaar");
  const transacties = await laadTransacties<Transaction>(supabase, user!.id, { van: formatDateInput(start), tot: formatDateInput(end) });
  const winst = aggregateTransactions(transacties).winst;
  const verpl = await laadVerplichtingen(supabase, user!.id);
  const auto = await inkomenUitAdministratie(supabase, user!.id, profile.rechtsvorm, winst, dagenVoorbijInJaar(vandaag), jaar);

  const autoUitleg = auto
    ? auto.uitleg
    : profile.rechtsvorm === "bv"
      ? "Bij een BV is de winst van het bedrijf niet je eigen inkomen. Vul zelf in wat je per maand netto voor jezelf overhoudt (bijvoorbeeld je salaris)."
      : "Voor jouw rechtsvorm kan het inkomen niet automatisch worden bepaald. Vul zelf in wat je per maand netto overhoudt.";

  return (
    <div className="fade-in space-y-6">
      {header}
      <GeldBeheer
        vandaag={vandaag}
        inkomenAuto={auto ? { perMaand: auto.perMaand, betrouwbaar: auto.betrouwbaar } : null}
        autoUitleg={autoUitleg}
        instellingen={gegevens.instellingen}
        posten={gegevens.posten}
        uitgaven={gegevens.uitgaven}
        doelen={gegevens.doelen}
        verplichtingen={verpl.verplichtingen}
        verplichtingenBeschikbaar={verpl.beschikbaar}
      />
    </div>
  );
}
