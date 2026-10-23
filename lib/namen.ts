// Namen vergelijken (leveranciers, klanten, je eigen bedrijfsnaam). Los van de AI-code, zodat de scan én de
// administratiecontrole exact dezelfde regels gebruiken en alles los te testen is.

const RECHTSVORM_TOKENS = new Set(["bv", "nv", "vof", "cv", "sarl", "gmbh", "ltd", "llc", "inc", "eenmanszaak", "stichting"]);

function naamTokens(s: string | null): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/&/g, " en ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !RECHTSVORM_TOKENS.has(t));
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// Strikt: dezelfde naam, op hoofdletters, leestekens, spaties en rechtsvorm na. Spelfouten tellen
// bewust als VERSCHIL — juist die willen we door een derde lezing laten beslechten.
export function zelfdeNaam(a: string | null, b: string | null): boolean {
  const x = naamTokens(a);
  const y = naamTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  if (x.join("") === y.join("")) return true;
  const [kort, lang] = x.length <= y.length ? [x, y] : [y, x];
  return kort.join("").length >= 5 && kort.every((t, i) => lang[i] === t);
}

// Soepel: om te bepalen of een naam op het document "mijn bedrijf" is (handelsnaam wijkt vaak licht af).
export function lijktOpEigenBedrijf(eigen: string, naam: string | null): boolean {
  const x = naamTokens(eigen).join("");
  const y = naamTokens(naam).join("");
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))) return true;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length) >= 0.8;
}
