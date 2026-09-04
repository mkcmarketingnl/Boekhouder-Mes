import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { getAccessStatus } from "@/lib/subscription";
import { MES_CHAT_SYSTEM_PROMPT, buildMesContext } from "@/lib/anthropic/prompts";
import { aggregateTransactions, getPeriodBounds } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatDateInput } from "@/lib/format";
import type { ChatMessage, Profile, Transaction } from "@/lib/types";

const MAX_TITLE_LENGTH = 48;

export async function POST(request: NextRequest) {
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

  const { conversationId: incomingConversationId, message } = await request.json();
  const trimmedMessage = String(message ?? "").trim();

  if (!trimmedMessage) {
    return NextResponse.json({ error: "Bericht is leeg." }, { status: 400 });
  }

  let conversationId = incomingConversationId as string | undefined;

  if (!conversationId) {
    const titel =
      trimmedMessage.length > MAX_TITLE_LENGTH ? `${trimmedMessage.slice(0, MAX_TITLE_LENGTH)}...` : trimmedMessage;
    const { data: conversation, error: convError } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id, titel })
      .select()
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: "Gesprek kon niet worden aangemaakt." }, { status: 500 });
    }
    conversationId = conversation.id;
  } else {
    const { data: conversation } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conversation) {
      return NextResponse.json({ error: "Gesprek niet gevonden." }, { status: 404 });
    }
  }

  const { error: insertUserMsgError } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role: "user", content: trimmedMessage });

  if (insertUserMsgError) {
    return NextResponse.json({ error: "Bericht kon niet worden opgeslagen." }, { status: 500 });
  }

  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const history = (historyRows ?? []) as ChatMessage[];

  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
  const profile = profileRow as Profile;

  const { start, end } = getPeriodBounds("jaar");
  const { data: yearTransactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .gte("factuurdatum", formatDateInput(start))
    .lte("factuurdatum", formatDateInput(end));

  const snapshot = aggregateTransactions((yearTransactions ?? []) as Transaction[]);
  const belasting = estimateIncomeTax(profile.rechtsvorm, snapshot.winst);

  const context = buildMesContext({
    bedrijfsnaam: profile.bedrijfsnaam,
    rechtsvorm: profile.rechtsvorm,
    activiteiten: profile.activiteiten,
    standaardBtwPercentage: profile.standaard_btw_percentage,
    jaar: new Date().getFullYear(),
    omzet: snapshot.omzet,
    kosten: snapshot.kosten,
    winst: snapshot.winst,
    geschatteBelasting: belasting.bedrag,
  });

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: MES_CHAT_SYSTEM_PROMPT.replace("{{CONTEXT}}", context),
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const replyText = textBlock && textBlock.type === "text" ? textBlock.text : "Sorry, daar kwam geen antwoord uit. Probeer het nog eens.";

    const { data: assistantMessage, error: insertAssistantError } = await supabase
      .from("chat_messages")
      .insert({ conversation_id: conversationId, role: "assistant", content: replyText })
      .select()
      .single();

    if (insertAssistantError) throw insertAssistantError;

    await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    return NextResponse.json({ conversationId, message: assistantMessage });
  } catch {
    return NextResponse.json({ error: "Mes kon niet antwoorden. Probeer het opnieuw." }, { status: 502 });
  }
}
