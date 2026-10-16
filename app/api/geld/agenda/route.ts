import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { maakAgenda, type AgendaItem } from "@/lib/ics";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Agenda-bestand (.ics) met herinneringen voor je verplichtingen: één bepaalde (?id=...) of alle openstaande.
// Alleen je eigen gegevens (de database dwingt dat ook zelf af).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id");
  if (id !== null && !UUID.test(id)) return NextResponse.json({ error: "Ongeldig id." }, { status: 400 });

  let query = supabase.from("geld_verplichtingen").select("id, naam, bedrag, deadline, instantie, notitie, betaald_op").eq("user_id", user.id);
  query = id ? query.eq("id", id) : query.is("betaald_op", null);
  const { data, error } = await query.order("deadline", { ascending: true }).limit(200);
  if (error) return NextResponse.json({ error: "Laden is mislukt." }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "Niets om in je agenda te zetten." }, { status: 404 });

  const eur = (n: number) => "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const items: AgendaItem[] = data.map((v) => ({
    id: v.id as string,
    titel: `Betalen: ${v.naam}`,
    omschrijving: [`Bedrag: ${eur(Number(v.bedrag))}`, v.instantie ? `Aan: ${v.instantie}` : null, v.notitie ? String(v.notitie) : null, "Uit Boekhouder Mes."].filter(Boolean).join("\n"),
    datum: v.deadline as string,
  }));

  return new NextResponse(maakAgenda(items), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id ? "deadline" : "deadlines"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
