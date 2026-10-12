export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

// Datum als YYYY-MM-DD volgens de LOKALE kalenderdatum. toISOString() rekent naar UTC om, waardoor een
// periodegrens (bijv. 1 juli 00:00 lokale tijd) op een server in een andere tijdzone een dag opschuift en
// facturen op de eerste/laatste dag van een kwartaal in de verkeerde periode (en aangifte) belanden.
export function formatDateInput(date: string | Date): string {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Rekenregel staat op één plek (lib/btw.ts); hier alleen doorgegeven voor bestaande imports.
export { berekenExclBtw } from "@/lib/btw";
