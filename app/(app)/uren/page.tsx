import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { UrenBeheer } from "@/components/uren/UrenBeheer";
import { UrencriteriumKaart } from "@/components/uren/UrencriteriumKaart";
import { laadKlanten } from "@/lib/klantenDb";
import { laadUren } from "@/lib/urenDb";
import { vandaagNl } from "@/lib/facturen";
import { formatUren, somMinuten } from "@/lib/uren";

const MAAND_NAMEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function maandGrenzen(maand: string) {
  const [j, m] = maand.split("-").map(Number);
  const laatste = new Date(Date.UTC(j, m, 0)).getUTCDate();
  const vorige = m === 1 ? `${j - 1}-12` : `${j}-${String(m - 1).padStart(2, "0")}`;
  const volgende = m === 12 ? `${j + 1}-01` : `${j}-${String(m + 1).padStart(2, "0")}`;
  return { van: `${maand}-01`, tot: `${maand}-${String(laatste).padStart(2, "0")}`, vorige, volgende, label: `${MAAND_NAMEN[m - 1]} ${j}` };
}

export default async function UrenPage({ searchParams }: { searchParams: Promise<{ maand?: string }> }) {
  const { maand } = await searchParams;
  const vandaag = vandaagNl();
  const huidigeMaand = vandaag.slice(0, 7);
  const gekozen = maand && /^\d{4}-(0[1-9]|1[0-2])$/.test(maand) ? maand : huidigeMaand;
  const grenzen = maandGrenzen(gekozen);
  const jaar = Number(vandaag.slice(0, 4));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [gegevens, { klanten }, { data: settings }] = await Promise.all([
    laadUren(supabase, user!.id, grenzen.van, grenzen.tot, jaar),
    laadKlanten(supabase, user!.id),
    supabase.from("invoice_settings").select("*").eq("user_id", user!.id).maybeSingle(),
  ]);
  const standaardTarief = settings && "standaard_uurtarief" in settings && settings.standaard_uurtarief != null ? Number(settings.standaard_uurtarief) : null;

  const maandMinuten = somMinuten(gegevens.periode);
  const maandFactureerbaar = somMinuten(gegevens.periode.filter((u) => u.factureerbaar));

  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="display text-2xl font-semibold">Uren</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">Houd je uren bij per klant en zet ze met één klik op een factuur. Factureerbare uren worden vergrendeld zodra ze op een factuur staan, zodat niets dubbel kan.</p>
      </div>

      {!gegevens.beschikbaar ? (
        <Card className="border-warn/30 bg-warn-bg p-5">
          <h2 className="display mb-1 text-[15px] font-semibold">Bijna klaar</h2>
          <p className="text-[13px] leading-relaxed">Urenregistratie heeft een eenmalige database-update nodig (migratie 0008_uren_belasting_geld.sql in Supabase). Zodra dat is gedaan werkt dit scherm meteen.</p>
        </Card>
      ) : (
        <>
          <UrencriteriumKaart jaarMinuten={gegevens.jaarMinuten} factureerbaarMinuten={gegevens.jaarFactureerbaarMinuten} vandaag={vandaag} jaar={jaar} />

          <UrenBeheer
            periode={gegevens.periode}
            openUren={gegevens.openUren}
            klanten={klanten.map((k) => ({ naam: k.naam, uurtarief: k.uurtarief != null ? Number(k.uurtarief) : null }))}
            standaardTarief={standaardTarief}
            vandaag={vandaag}
          />

          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <Link href={`/uren?maand=${grenzen.vorige}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-white hover:bg-paper-dark" aria-label="Vorige maand">
              <ChevronLeft size={16} />
            </Link>
            <div className="text-center">
              <div className="text-[14px] font-medium capitalize">{grenzen.label}</div>
              <div className="mono text-[12px] text-muted">
                {formatUren(maandMinuten / 60)} · waarvan {formatUren(maandFactureerbaar / 60)} factureerbaar
              </div>
            </div>
            <Link href={`/uren?maand=${grenzen.volgende}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line bg-white hover:bg-paper-dark" aria-label="Volgende maand">
              <ChevronRight size={16} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
