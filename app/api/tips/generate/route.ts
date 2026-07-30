import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { TIPS_SYSTEM_PROMPT, buildTipsUserPrompt, parseClaudeJson } from "@/lib/anthropic/prompts";
import { aggregateTransactions, getPeriodBounds } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
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

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: TIPS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildTipsUserPrompt({
            rechtsvorm: profile.rechtsvorm,
            activiteiten: profile.activiteiten,
            jaar,
            omzet: snapshot.omzet,
            kosten: snapshot.kosten,
            winst: snapshot.winst,
            geschatteBelasting: belasting.bedrag,
          }),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Geen tekstantwoord van AI ontvangen.");
    }

    const { tips } = parseClaudeJson<{ tips: string[] }>(textBlock.text);
    const contextSnapshot = { jaar, ...snapshot, geschatteBelasting: belasting.bedrag };

    const rows = tips.slice(0, 5).map((tip_tekst) => ({
      user_id: user.id,
      tip_tekst,
      context_snapshot: contextSnapshot,
    }));

    const { data: inserted, error: insertError } = await supabase.from("ai_tips").insert(rows).select();
    if (insertError) throw insertError;

    return NextResponse.json({ data: inserted });
  } catch {
    return NextResponse.json(
      { error: "Tips konden niet worden gegenereerd. Probeer het later opnieuw." },
      { status: 502 }
    );
  }
}
