import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessStatus } from "@/lib/subscription";
import { CLAUDE_MODEL_EXTRACT } from "@/lib/anthropic/client";
import { FACTUUR_BTW_SYSTEM_PROMPT } from "@/lib/anthropic/factuurPrompts";
import { vraagJson } from "@/lib/anthropic/json";

export const maxDuration = 60;

interface Antwoord {
  tarieven: { regel: number; percentage: number; reden: string }[];
  btw_verlegd: boolean;
  verlegd_reden: string | null;
}

// Stelt per factuurregel een BTW-tarief voor. De AI kiest alleen het tarief; de bedragen rekent de app zelf.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const regels: { omschrijving: string }[] = Array.isArray(body?.regels) ? body.regels : [];
  if (regels.length === 0 || regels.length > 50) return NextResponse.json({ error: "Geen regels om te beoordelen." }, { status: 400 });

  const { data: profiel } = await supabase.from("profiles").select("activiteiten, rechtsvorm").eq("user_id", user.id).maybeSingle();

  const gebruiker = JSON.stringify(
    {
      jouw_bedrijfsactiviteiten: profiel?.activiteiten ?? "",
      klant: { naam: String(body.klant_naam ?? ""), land: String(body.klant_land ?? "Nederland"), btw_nummer: body.klant_btw_nummer ? String(body.klant_btw_nummer) : null },
      regels: regels.map((r, i) => ({ regel: i + 1, omschrijving: String(r.omschrijving ?? "").slice(0, 300) })),
    },
    null,
    2
  );

  try {
    const antwoord = await vraagJson<Antwoord>({ model: CLAUDE_MODEL_EXTRACT, system: FACTUUR_BTW_SYSTEM_PROMPT, gebruiker });
    if (!antwoord || !Array.isArray(antwoord.tarieven)) throw new Error("Onleesbaar antwoord");
    // Alleen geldige tarieven doorlaten; nooit iets uit het antwoord ongecontroleerd overnemen.
    const tarieven = antwoord.tarieven
      .filter((t) => Number.isInteger(t.regel) && t.regel >= 1 && t.regel <= regels.length && [21, 9, 0].includes(Number(t.percentage)))
      .map((t) => ({ regel: t.regel, percentage: Number(t.percentage), reden: String(t.reden ?? "").slice(0, 300) }));
    return NextResponse.json({ data: { tarieven, btw_verlegd: !!antwoord.btw_verlegd, verlegd_reden: antwoord.verlegd_reden ?? null } });
  } catch (err) {
    console.error("BTW-suggestie voor factuur mislukt:", err);
    return NextResponse.json({ error: "De BTW-suggestie is niet gelukt. Kies het tarief zelf of probeer het opnieuw." }, { status: 502 });
  }
}
