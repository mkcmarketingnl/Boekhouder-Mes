// Bedragen intypen zoals Nederlanders dat doen: "87,50" werkt net zo goed als "87.50" en "1.250,75".
// Geeft null als de tekst geen (begin van een) getal is; een lege tekst telt als 0.
export function parseBedrag(tekst: string): number | null {
  let s = tekst.replace(/[\s€]/g, "");
  if (!/^-?[\d.,]*$/.test(s)) return null;
  const komma = (s.match(/,/g) ?? []).length;
  const punt = (s.match(/\./g) ?? []).length;
  if (komma > 0 && punt > 0) {
    // het laatste scheidingsteken is de decimaal, de rest zijn duizendtallen
    const dec = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    s = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1).replace(/[.,]/g, "");
  } else if (komma > 1 || punt > 1) {
    s = s.replace(/[.,]/g, "");
  } else if (komma === 1) {
    s = s.replace(",", ".");
  } else if (punt === 1 && /^-?\d{1,3}\.\d{3}$/.test(s)) {
    // "1.250" is bij geldbedragen een duizendtal, geen 1,25
    s = s.replace(".", "");
  }
  if (s === "" || s === "-" || s === "." || s === "-.") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Tekst voor in een invoerveld: komma als decimaalteken, leeg bij 0.
export function bedragNaarTekst(n: number): string {
  return n === 0 || !Number.isFinite(n) ? "" : String(n).replace(".", ",");
}

// Voor velden die het bedrag als tekst bewaren (met een punt als decimaalteken, zodat Number() het kan lezen):
// "87,50" -> "87.50", "87," -> "87." (tijdens het typen), "1.250,75" -> "1250.75". Geeft null bij ongeldige invoer.
export function normaliseerInvoer(tekst: string): string | null {
  const n = parseBedrag(tekst);
  if (n === null) return null;
  const s = tekst.replace(/[\s€]/g, "");
  const eenvoudig = /^-?\d*[.,]?\d*$/.test(s) && !/^-?\d{1,3}\.\d{3}$/.test(s);
  return eenvoudig ? s.replace(",", ".") : String(n);
}
