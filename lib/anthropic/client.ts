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

// Haiku blijft beschikbaar voor goedkope, niet-kritieke taken. NIET gebruiken voor het scannen van
// facturen: in onze meting las Haiku 4.5 jaartallen, namen en het type (kosten/omzet) regelmatig fout.
export const CLAUDE_MODEL_FAST = "claude-haiku-4-5-20251001";

// Scannen van bonnen/facturen: elke fout daarin belandt in de boekhouding van de gebruiker, dus hier
// gebruiken we een sterk model (Sonnet 5.5 las alle testfacturen foutloos), twee keer onafhankelijk,
// met Opus 5.5 als scheidsrechter zodra de twee scans elkaar tegenspreken.
export const CLAUDE_MODEL_EXTRACT = "claude-sonnet-5-5";
export const CLAUDE_MODEL_ARBITER = "claude-opus-5-5";
