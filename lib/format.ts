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

export function formatDateInput(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function berekenExclBtw(totaalInclBtw: number, btwPercentage: number) {
  const bedragExclBtw = totaalInclBtw / (1 + btwPercentage / 100);
  const btwBedrag = totaalInclBtw - bedragExclBtw;
  return { bedragExclBtw, btwBedrag };
}
