import { createClient } from "@/lib/supabase/server";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { PeriodNav } from "@/components/dashboard/PeriodNav";
import { BtwModus } from "@/components/btw/BtwModus";
import { aggregateTransactions, getPeriodBounds, type PeriodType } from "@/lib/finance";
import { laadTransacties } from "@/lib/transactionsDb";
import { berekenAangifte, uiterlijkeDatum, type AangifteTransactie } from "@/lib/btwAangifte";
import { formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

export default async function BtwPage({ searchParams }: { searchParams: Promise<{ periode?: string; ref?: string }> }) {
  const { periode, ref } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user!.id).single();
  const profile = profileRow as Profile;

  // Standaard het aangiftetijdvak dat de gebruiker bij het aanmaken van het profiel koos.
  const periodType: PeriodType = ["maand", "kwartaal", "jaar"].includes(periode ?? "")
    ? (periode as PeriodType)
    : profile.aangiftetijdvak;
  const reference = ref && !isNaN(Date.parse(ref)) ? new Date(ref) : new Date();
  const { start, end, label } = getPeriodBounds(periodType, reference);

  const transacties = (await laadTransacties<Transaction>(supabase, user!.id, { van: formatDateInput(start), tot: formatDateInput(end) })).reverse();
  const aangifte = berekenAangifte(transacties as unknown as AangifteTransactie[]);

  // Vangnet: het eindbedrag hier en het BTW-saldo op het dashboard komen uit dezelfde regels en horen
  // exact gelijk te zijn. Zo niet, dan zien we dat meteen in de logs i.p.v. dat de boekhouding stilletjes afwijkt.
  const dashboardSaldo = aggregateTransactions(transacties).btwSaldo;
  if (Math.round(dashboardSaldo * 100) !== Math.round(aangifte.subtotaal * 100)) {
    console.error("BTW-modus wijkt af van dashboard-BTW-saldo", { periode: label, dashboardSaldo, btwModus: aangifte.subtotaal });
  }

  const uiterlijk = uiterlijkeDatum(periodType, end);
  const periodeLoopt = end >= new Date();

  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="display text-2xl font-semibold">BTW-modus</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Zo zou je BTW-aangifte eruitzien, met de woorden van het echte formulier — om te snappen wat je invult. Dit is een hulpmiddel; de aangifte zelf doe je bij de Belastingdienst.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector active={periodType} basePath="/btw" />
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted">{label}</span>
          <PeriodNav periodType={periodType} reference={reference} basePath="/btw" />
        </div>
      </div>

      <BtwModus aangifte={aangifte} periodeLabel={label} uiterlijk={uiterlijk} periodeLoopt={periodeLoopt} />

      <p className="text-[11.5px] leading-relaxed text-muted">
        Indicatie op basis van de facturen die je hebt toegevoegd — geen officiële BTW-aangifte en geen vervanging voor een boekhouder. Controleer bij twijfel altijd je eigen administratie.
      </p>
    </div>
  );
}
