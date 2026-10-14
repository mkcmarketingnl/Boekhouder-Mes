// CSV voor Excel: puntkomma als scheidingsteken, komma als decimaalteken (Nederlandse instellingen), met BOM zodat
// accenten goed staan. Tekst uit je administratie (leveranciersnamen van gescande bonnen!) kan met = + - @ beginnen
// en zou dan in Excel als formule worden uitgevoerd; daarom zetten we daar een apostrof voor.

export function csvTekst(waarde: string | null | undefined): string {
  let t = (waarde ?? "").replace(/[\r\n]+/g, " ").trim();
  if (/^[=+\-@\t]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
}

export function csvGetal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}

export function maakCsv(kop: string[], rijen: string[][]): string {
  return "﻿" + [kop.map(csvTekst).join(";"), ...rijen.map((r) => r.join(";"))].join("\r\n") + "\r\n";
}
