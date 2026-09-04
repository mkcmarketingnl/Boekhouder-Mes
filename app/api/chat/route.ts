import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { getAccessStatus } from "@/lib/subscription";
import { MES_CHAT_SYSTEM_PROMPT, buildMesContext } from "@/lib/anthropic/prompts";
import { aggregateTransactions, getPeriodBounds } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatDateInput } from "@/lib/format";
import type { ChatMessage, Profile, Transaction } from "@/lib/types";

const MAX_TITLE_LENGTH = 48;
const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function errorResponse(error: string, status: number) {
  return new Response(sseEvent("error", { error }), {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse("Niet ingelogd.", 401);
  }

  const { hasAccess } = await getAccessStatus(user.id);
  if (!hasAccess) {
    return errorResponse("Geen actief abonnement.", 403);
  }

  const { conversationId: incomingConversationId, message } = await request.json();
  const trimmedMessage = String(message ?? "").trim();

  if (!trimmedMessage) {
    return errorResponse("Bericht is leeg.", 400);
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
      return errorResponse("Gesprek kon niet worden aangemaakt.", 500);
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
      return errorResponse("Gesprek niet gevonden.", 404);
    }
  }

  const { error: insertUserMsgError } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role: "user", content: trimmedMessage });

  if (insertUserMsgError) {
    return errorResponse("Bericht kon niet worden opgeslagen.", 500);
  }

  const { data: historyRows } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const history = (historyRows ?? []) as ChatMessage[];

  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  const profile = profileRow as Profile | null;

  if (!profile) {
    return errorResponse("Bedrijfsprofiel ontbreekt.", 400);
  }

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

  const finalConversationId = conversationId;

  // Sonnet-antwoorden met volledige gespreksgeschiedenis kunnen 10-20+ seconden duren om
  // volledig te genereren — zonder streaming zit de gebruiker die hele tijd naar een statische
  // "denkt na"-indicator te staren, wat aanvoelt als "geen antwoord". We streamen de tekst dus
  // via Server-Sent Events zodat het antwoord meteen zichtbaar begint te verschijnen.
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent("meta", { conversationId: finalConversationId }));

      try {
        const anthropic = getAnthropicClient();
        const messageStream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: MES_CHAT_SYSTEM_PROMPT.replace("{{CONTEXT}}", context),
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        });

        messageStream.on("text", (delta) => {
          controller.enqueue(sseEvent("delta", { text: delta }));
        });

        const finalMessage = await messageStream.finalMessage();
        const textBlock = finalMessage.content.find((b) => b.type === "text");
        const replyText =
          textBlock && textBlock.type === "text" ? textBlock.text : "Sorry, daar kwam geen antwoord uit. Probeer het nog eens.";

        const { data: assistantMessage, error: insertAssistantError } = await supabase
          .from("chat_messages")
          .insert({ conversation_id: finalConversationId, role: "assistant", content: replyText })
          .select()
          .single();

        if (insertAssistantError) throw insertAssistantError;

        await supabase
          .from("chat_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", finalConversationId);

        controller.enqueue(sseEvent("done", { message: assistantMessage }));
      } catch {
        controller.enqueue(sseEvent("error", { error: "Mes kon niet antwoorden. Probeer het opnieuw." }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
