import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import {
  BTW_SUGGESTIE_SYSTEM_PROMPT,
  buildBtwSuggestieUserPrompt,
  parseClaudeJson,
} from "@/lib/anthropic/prompts";

interface BtwSuggestie {
  percentage: 21 | 9 | 0;
  vrijgesteld: boolean;
  toelichting: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { activiteiten } = await request.json();
  if (!activiteiten || typeof activiteiten !== "string" || activiteiten.trim().length < 3) {
    return NextResponse.json({ error: "Beschrijf eerst je bedrijfsactiviteiten." }, { status: 400 });
  }

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: BTW_SUGGESTIE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildBtwSuggestieUserPrompt(activiteiten) }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Geen tekstantwoord van AI ontvangen.");
    }

    const result = parseClaudeJson<BtwSuggestie>(textBlock.text);
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json(
      { error: "Kon geen BTW-tarief bepalen. Kies handmatig het tarief dat het best past." },
      { status: 502 }
    );
  }
}
