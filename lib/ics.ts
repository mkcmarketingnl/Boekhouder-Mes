// Agenda-bestand (.ics) voor een deadline, met herinneringen op je telefoon. Bewust zonder app-imports, zodat het los
// te testen is. Volgt RFC 5545: tekst wordt geëscaped, regels langer dan 75 bytes worden gevouwen en alles eindigt op CRLF.

export interface AgendaItem {
  id: string;
  titel: string;
  omschrijving: string;
  datum: string; // YYYY-MM-DD, een hele dag
}

// Haalt alles weg wat een regel in het bestand kan breken of er een andere regel in kan smokkelen.
export function icsTekst(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    // overige besturingstekens zijn in een ICS-bestand niet toegestaan
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

// Vouwt een regel op 75 bytes (UTF-8); een vervolgregel begint met één spatie. Knipt nooit midden in een teken.
export function vouw(regel: string): string {
  const enc = new TextEncoder();
  if (enc.encode(regel).length <= 75) return regel;
  const delen: string[] = [];
  let huidig = "";
  let bytes = 0;
  let limiet = 75;
  for (const teken of regel) {
    const b = enc.encode(teken).length;
    if (bytes + b > limiet) {
      delen.push(huidig);
      huidig = "";
      bytes = 0;
      limiet = 74; // de spatie vooraan telt mee
    }
    huidig += teken;
    bytes += b;
  }
  if (huidig) delen.push(huidig);
  return delen.join("\r\n ");
}

const compact = (d: string) => d.replace(/-/g, "");

function volgendeDag(d: string): string {
  const [j, m, dag] = d.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, dag + 1)).toISOString().slice(0, 10);
}

// Herinneringen om 09:00: 14, 7, 3 en 1 dag ervoor en op de dag zelf. Voor een hele-dag-afspraak telt een trigger vanaf
// 00:00 van de dag, vandaar dat "14 dagen ervoor om 09:00" als -P13DT15H wordt geschreven.
const ALARMEN: { trigger: string; tekst: string }[] = [
  { trigger: "-P13DT15H", tekst: "Over 14 dagen" },
  { trigger: "-P6DT15H", tekst: "Over 7 dagen" },
  { trigger: "-P2DT15H", tekst: "Over 3 dagen" },
  { trigger: "-PT15H", tekst: "Morgen" },
  { trigger: "PT9H", tekst: "Vandaag" },
];

export function maakAgenda(items: AgendaItem[], nu: Date = new Date()): string {
  const stempel = nu.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const regels: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Boekhouder Mes//Deadlines//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const item of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.datum)) continue;
    regels.push(
      "BEGIN:VEVENT",
      `UID:${icsTekst(item.id)}@boekhouder-mes`,
      `DTSTAMP:${stempel}`,
      `DTSTART;VALUE=DATE:${compact(item.datum)}`,
      `DTEND;VALUE=DATE:${compact(volgendeDag(item.datum))}`,
      `SUMMARY:${icsTekst(item.titel)}`,
      `DESCRIPTION:${icsTekst(item.omschrijving)}`,
      "TRANSP:TRANSPARENT"
    );
    for (const a of ALARMEN) {
      regels.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsTekst(`${a.tekst}: ${item.titel}`)}`, `TRIGGER:${a.trigger}`, "END:VALARM");
    }
    regels.push("END:VEVENT");
  }
  regels.push("END:VCALENDAR");
  return regels.map(vouw).join("\r\n") + "\r\n";
}
