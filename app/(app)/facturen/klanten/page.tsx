import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { KlantenBeheer } from "@/components/facturen/KlantenBeheer";
import { laadKlanten } from "@/lib/klantenDb";

export default async function KlantenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { beschikbaar, klanten } = await laadKlanten(supabase, user!.id);

  return (
    <div className="fade-in space-y-5">
      <div>
        <Link href="/facturen" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Facturen
        </Link>
        <h1 className="display text-2xl font-semibold">Mijn klanten</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">Klanten die je een factuur stuurt, bewaar je hier. Zo vul je hun gegevens de volgende keer niet opnieuw in.</p>
      </div>
      {beschikbaar ? (
        <KlantenBeheer klanten={klanten} metTarief={klanten.length === 0 ? false : "uurtarief" in klanten[0]} />
      ) : (
        <Card className="border-warn/30 bg-warn-bg p-5">
          <h2 className="display mb-1 text-[15px] font-semibold">Bijna klaar</h2>
          <p className="text-[13px] leading-relaxed">Het bewaren van klanten heeft een eenmalige database-update nodig (migratie 0007_klanten.sql in Supabase). Zodra dat is gedaan werkt dit scherm meteen.</p>
        </Card>
      )}
    </div>
  );
}
