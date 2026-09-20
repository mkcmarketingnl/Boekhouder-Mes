import { createClient } from "@/lib/supabase/server";
import { getAnthropicClient, CLAUDE_MODEL_FAST } from "@/lib/anthropic/client";
import { getAccessStatus } from "@/lib/subscription";
import { TIPS_SYSTEM_PROMPT, buildTipsUserPrompt } from "@/lib/anthropic/prompts";
import { aggregateTransactions, getPeriodBounds, groupByLeverancier } from "@/lib/finance";
import { estimateIncomeTax } from "@/lib/tax";
import { formatDateInput } from "@/lib/format";
import type { Profile, Transaction } from "@/lib/types";

export const maxDuration = 30;

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

// Tips staan op losse "TIP: ..." regels (zie TIPS_SYSTEM_PROMPT) i.p.v. in JSON, juist om ze
// stukje bij beetje te kunnen streamen — bij elke binnenkomende chunk checken we hoeveel volledige
// tips er inmiddels in de buffer staan (alles vóór de laatste "TIP:"-marker is per definitie af).
function parseCompleteTips(buffer: string): string[] {
  const parts = buffer.split(/\n?TIP:\s*/).filter((s) => s.trim().length > 0);
  return parts;
}

export async function POST() {
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

  const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  const profile = profileRow as Profile | null;

  if (!profile) {
    return errorResponse("Bedrijfsprofiel ontbreekt.", 400);
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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropic = getAnthropicClient();
        const messageStream = anthropic.messages.stream({
          model: CLAUDE_MODEL_FAST,
          max_tokens: 1024,
          system: TIPS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        });

        let buffer = "";
        let emittedCount = 0;

        messageStream.on("text", (delta) => {
          buffer += delta;
          // De laatste tip in de buffer kan nog aan het groeien zijn (nog geen volgende "TIP:"
          // marker gezien) — die pas als "af" beschouwen zodra er ofwel een volgende tip start,
          // ofwel de stream helemaal klaar is (hieronder na finalMessage()).
          const parts = parseCompleteTips(buffer);
          const completeCount = Math.max(0, parts.length - 1);
          for (let i = emittedCount; i < completeCount; i++) {
            controller.enqueue(sseEvent("tip", { text: parts[i].trim() }));
          }
          emittedCount = completeCount;
        });

        await messageStream.finalMessage();

        const allTips = parseCompleteTips(buffer)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 5);

        for (let i = emittedCount; i < allTips.length; i++) {
          controller.enqueue(sseEvent("tip", { text: allTips[i] }));
        }

        if (allTips.length === 0) {
          throw new Error("Leeg of ongeldig tips-antwoord.");
        }

        const contextSnapshot = { jaar, ...snapshot, geschatteBelasting: belasting.bedrag };
        const rows = allTips.map((tip_tekst) => ({
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

        controller.enqueue(sseEvent("done", { data: inserted }));
      } catch (err) {
        console.error("Tips genereren mislukt:", err);
        controller.enqueue(
          sseEvent("error", { error: "Tips konden niet worden gegenereerd. Probeer het later opnieuw." })
        );
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
