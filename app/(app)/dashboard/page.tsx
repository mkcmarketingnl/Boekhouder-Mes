import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { DASHBOARD_DISCLAIMER } from "@/components/ui/Disclaimer";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("voornaam")
    .eq("user_id", user!.id)
    .single();

  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="display text-2xl font-semibold">Welkom terug, {profile?.voornaam}</h1>
        <Link href="/onboarding" className="mt-1 inline-block text-xs text-muted underline">
          profiel bewerken
        </Link>
      </div>

      <p className="rounded-md border border-line bg-paper-dark px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted">
        {DASHBOARD_DISCLAIMER}
      </p>

      <Card className="p-6 text-sm text-muted">
        Je account en profiel staan klaar. Het scannen van bonnen/facturen, het dashboard met
        cijfers en de AI-tips volgen in de volgende bouwfase.
      </Card>
    </div>
  );
}
