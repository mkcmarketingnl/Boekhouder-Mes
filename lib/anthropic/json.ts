import { getAnthropicClient } from "@/lib/anthropic/client";
import { parseClaudeJson } from "@/lib/anthropic/prompts";

// Eén tekstvraag aan Claude die JSON teruggeeft. Sonnet/Opus 5.5 "denken" eerst even na en tellen dat mee
// in max_tokens, dus houd die ruim. Geeft null als het antwoord niet als JSON te lezen is.
export async function vraagJson<T>(params: { model: string; system: string; gebruiker: string; maxTokens?: number }): Promise<T | null> {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    messages: [{ role: "user", content: params.gebruiker }],
  });
  const tekst = response.content.find((b) => b.type === "text");
  if (!tekst || tekst.type !== "text") return null;
  try {
    return parseClaudeJson<T>(tekst.text);
  } catch {
    return null;
  }
}
