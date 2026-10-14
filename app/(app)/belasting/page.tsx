import { createClient } from "@/lib/supabase/server";
import { laadTransacties } from "@/lib/transactionsDb";
import { Card } from "@/components/ui/Card";
import { BelastingModus } from "@/components/belasting/BelastingModus";
import { aggregateTransactions, getPeriodBounds } from "@/lib/finance";
import { laadIbAntwoorden } from "@/lib/belastingDb";
import { estimateIncomeTax } from "@/lib/tax";
import { laadJaarMinuten } from "@/lib/urenDb";
import { urencriteriumStand } from "@/lib/uren";
import { vandaagNl } from "@/lib/facturen";
import { formatCurrency, formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

export default async function BelastingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
  const profile = profileRow as Profile;

  const vandaag = vandaagNl();
  const jaar = Number(vandaag.slice(0, 4));
  const { start, end } = getPeriodBounds("jaar");
  const transacties = await laadTransacties<Transaction>(supabase, user!.id, { van: formatDateInput(start), tot: formatDateInput(end) });
  // Dezelfde som als het dashboard gebruikt, zodat het bedrag hier en daar altijd gelijk is.
  const winst = aggregateTransactions(transacties).winst;

  const header = (
    <div>
      <h1 className="display text-2xl font-semibold">Inkomstenbelasting</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">Beantwoord een paar ja/nee-vragen en zie wat je over {jaar} aan belasting kunt verwachten, welke aftrekposten er zijn en hoe je slim met je belasting omgaat. Een hulpmiddel om te leren; de aangifte zelf doe je bij de Belastingdienst.</p>
    </div>
  );

  if (profile.rechtsvorm === "bv") {
    const vpb = estimateIncomeTax("bv", winst, null, jaar);
    return (
      <div className="fade-in space-y-6">
        {header}
        <Card className="p-5">
          <h2 className="display mb-2 text-[15px] font-semibold">Jij hebt een BV</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Een BV betaalt geen inkomstenbelasting maar <strong className="text-ink">vennootschapsbelasting</strong> over de winst: 19% tot €200.000 en 25,8% daarboven. Jij als eigenaar betaalt daarnaast inkomstenbelasting over je eigen salaris (het gebruikelijk loon) en eventueel over dividend dat je uit de BV haalt. Dat is een heel andere berekening dan voor een eenmanszaak, en die zit niet in deze modus: de ja/nee-vragen over zelfstandigenaftrek en MKB-winstvrijstelling gelden niet voor jou.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed">
            Je winst tot nu toe is <strong>{formatCurrency(winst)}</strong>; dat geeft een vennootschapsbelasting van ongeveer <strong>{formatCurrency(vpb.bedrag)}</strong> (zonder rekening te houden met het salaris dat je jezelf uitbetaalt).
          </p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Laat je salaris en dividend bepalen door een boekhouder of belastingadviseur. Je kunt Mes (de chat) ook algemene vragen stellen over hoe een BV werkt.</p>
        </Card>
      </div>
    );
  }

  if (profile.rechtsvorm !== "eenmanszaak" && profile.rechtsvorm !== "vof") {
    return (
      <div className="fade-in space-y-6">
        {header}
        <Card className="p-5 text-[13px] text-muted">Voor jouw rechtsvorm is deze modus niet beschikbaar. Raadpleeg een boekhouder.</Card>
      </div>
    );
  }

  const [{ beschikbaar, antwoorden }, uren] = await Promise.all([laadIbAntwoorden(supabase, user!.id, jaar), laadJaarMinuten(supabase, user!.id, jaar)]);

  // Prognose pas na 45 dagen: eerder is het te onbetrouwbaar
  const dagenVoorbij = Math.max(1, Math.round((Date.UTC(jaar, Number(vandaag.slice(5, 7)) - 1, Number(vandaag.slice(8, 10))) - Date.UTC(jaar, 0, 1)) / 86400000) + 1);
  const dagenJaar = Math.round((Date.UTC(jaar + 1, 0, 1) - Date.UTC(jaar, 0, 1)) / 86400000);
  const winstPrognose = dagenVoorbij >= 45 && winst > 0 ? (winst / dagenVoorbij) * dagenJaar : null;

  const stand = uren.beschikbaar && uren.minuten > 0 ? urencriteriumStand(uren.minuten, vandaag) : null;

  return (
    <div className="fade-in space-y-6">
      {header}
      <BelastingModus
        jaar={jaar}
        rechtsvorm={profile.rechtsvorm}
        winstTotNu={winst}
        winstPrognose={winstPrognose}
        startAntwoorden={antwoorden ?? {}}
        opslaanMogelijk={beschikbaar}
        uren={stand ? { gewerktUren: stand.gewerktUren, prognoseUren: stand.prognoseUren, opKoers: stand.opKoers } : null}
      />
    </div>
  );
}
