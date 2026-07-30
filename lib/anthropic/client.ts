import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY ontbreekt. Vul deze in via .env.local om AI-functies te gebruiken."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Sonnet voor tips/BTW-suggestie (weinig aanroepen, kwaliteit van de tekst telt).
export const CLAUDE_MODEL = "claude-sonnet-5";

// Haiku voor het scannen van bonnen/facturen (verreweg de meeste AI-aanroepen,
// en vision-OCR + eenvoudige risicobeoordeling heeft geen Sonnet-niveau nodig).
export const CLAUDE_MODEL_FAST = "claude-haiku-4-5-20251001";
