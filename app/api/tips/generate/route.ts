import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { getAccessStatus } from "@/lib/subscription";
import { TIPS_SYSTEM_PROMPT, buildTipsUserPrompt, parseClaudeJson } from "@/lib/anthropic/prompts";
import { aggregateTransactions, getPeriodBounds, groupByLeverancier } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) {
    return NextResponse.json({ error: "Geen actief abonnement." }, { status: 403 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const profile = profileRow as Profile | null;

  if (!profile) {
    return NextResponse.json({ error: "Bedrijfsprofiel ontbreekt." }, { status: 400 });
  }

  const jaar = new Date().getFullYear();
  const { start, end } = getPeriodBounds("jaar");

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .gte("factuurdatum", formatDateInput(start))
    .lte("factuurdatum", formatDateInput(end));

  const snapshot = aggregateTransactions((transactions ?? []) as Transaction[]);
  const belasting = estimateIncomeTax(profile.rechtsvorm, snapshot.winst);

  const alleTransacties = (transactions ?? []) as Transaction[];
  const topRelaties = [...groupByLeverancier(alleTransacties, "kosten"), ...groupByLeverancier(alleTransacties, "omzet")]
    .sort((a, b) => b.totaal - a.totaal)
    .slice(0, 5)
    .map((r) => ({ naam: r.naam, totaal: r.totaal, aantal: r.aantal }));

  const userPrompt = buildTipsUserPrompt({
    rechtsvorm: profile.rechtsvorm,
    activiteiten: profile.activiteiten,
    jaar,
    omzet: snapshot.omzet,
    kosten: snapshot.kosten,
    winst: snapshot.winst,
    geschatteBelasting: belasting.bedrag,
    kostenPerCategorie: snapshot.kostenPerCategorie,
    topRelaties,
  });

  // Eén automatische herkansing bij een mislukte generatie (bijv. een afgekapt of licht
  // vervuild antwoord) voordat we de gebruiker een foutmelding tonen — dit soort transiënte
  // fouten treft anders relatief vaak dezelfde gebruikers en voelt dan structureel kapot aan.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: TIPS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Geen tekstantwoord van AI ontvangen.");
      }

      const { tips } = parseClaudeJson<{ tips: string[] }>(textBlock.text);
      if (!Array.isArray(tips) || tips.length === 0) {
        throw new Error("Leeg of ongeldig tips-antwoord.");
      }
      const contextSnapshot = { jaar, ...snapshot, geschatteBelasting: belasting.bedrag };

      const rows = tips.slice(0, 5).map((tip_tekst) => ({
        user_id: user.id,
        tip_tekst,
        context_snapshot: contextSnapshot,
      }));

      // Tips worden elk bezoek vers gegenereerd (geen stale tips bij terugkomst) — de oude set
      // vervangen we dus bij elke generatie i.p.v. te blijven stapelen, anders groeit de tabel
      // ongelimiteerd terwijl de oude rijen toch nooit meer getoond worden.
      await supabase.from("ai_tips").delete().eq("user_id", user.id);

      const { data: inserted, error: insertError } = await supabase.from("ai_tips").insert(rows).select();
      if (insertError) throw insertError;

      return NextResponse.json({ data: inserted });
    } catch (err) {
      lastError = err;
    }
  }

  console.error("Tips genereren mislukt na herkansing:", lastError);
  return NextResponse.json(
    { error: "Tips konden niet worden gegenereerd. Probeer het later opnieuw." },
    { status: 502 }
  );
}
