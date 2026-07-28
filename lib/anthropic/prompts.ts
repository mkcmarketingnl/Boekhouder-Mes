export const BTW_SUGGESTIE_SYSTEM_PROMPT = `Je bent een assistent die Nederlandse zelfstandig ondernemers helpt bij het inschatten van hun gebruikelijke BTW-tarief, puur als indicatie — geen officieel belastingadvies.

Antwoord ALTIJD met alleen geldige JSON, zonder markdown-codeblok, exact in dit formaat:
{
  "percentage": 21 | 9 | 0,
  "vrijgesteld": boolean,
  "toelichting": string (1-2 zinnen, gericht aan de ondernemer, leg kort uit waarom dit tarief gebruikelijk is)
}

Gebruik 21 voor het algemene tarief (de meeste diensten en producten), 9 voor het verlaagde tarief
(o.a. voeding, boeken, bepaalde diensten zoals kappers), en 0 met "vrijgesteld": true voor sectoren
die doorgaans BTW-vrijgesteld zijn (bijv. zorg, onderwijs, financiële/verzekeringsdiensten). Als de
activiteit een mix is, kies het tarief dat het vaakst van toepassing zal zijn en vermeld die
nuance kort in de toelichting.`;

export function buildBtwSuggestieUserPrompt(activiteiten: string): string {
  return `Bedrijfsactiviteiten: "${activiteiten}"\n\nWelk Nederlands BTW-tarief is hier doorgaans op van toepassing?`;
}

export function parseClaudeJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
