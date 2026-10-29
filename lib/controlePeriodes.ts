// De tijdvakken waarover je de administratie kunt controleren: dezelfde indeling als je BTW-aangifte (maand, kwartaal of
// jaar), zodat je vlak voor een aangifte precies dát tijdvak kunt nalopen. Bewust zonder app-imports, los te testen.

export type Tijdvak = "maand" | "kwartaal" | "jaar";

export interface PeriodeOptie {
  sleutel: string;
  label: string;
  begin: string; // YYYY-MM-DD
  einde: string;
  // het laatst afgesloten tijdvak: daar doe je nu je aangifte over
  isAangifte?: boolean;
}

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const p2 = (n: number) => String(n).padStart(2, "0");
const laatsteDag = (j: number, m: number) => new Date(Date.UTC(j, m, 0)).getUTCDate();

function kwartaal(j: number, q: number): PeriodeOptie {
  const eindMaand = q * 3;
  return { sleutel: `kwartaal-${j}-q${q}`, label: `Q${q} ${j}`, begin: `${j}-${p2(eindMaand - 2)}-01`, einde: `${j}-${p2(eindMaand)}-${p2(laatsteDag(j, eindMaand))}` };
}
function maand(j: number, m: number): PeriodeOptie {
  return { sleutel: `maand-${j}-${p2(m)}`, label: `${MAANDEN[m - 1]} ${j}`, begin: `${j}-${p2(m)}-01`, einde: `${j}-${p2(m)}-${p2(laatsteDag(j, m))}` };
}
function jaar(j: number): PeriodeOptie {
  return { sleutel: `jaar-${j}`, label: String(j), begin: `${j}-01-01`, einde: `${j}-12-31` };
}

// Nieuwste eerst, inclusief het lopende tijdvak. Het laatst afgesloten tijdvak is gemarkeerd als "aangifte".
export function periodeOpties(tijdvak: Tijdvak, vandaag: string): PeriodeOptie[] {
  const [j, m] = vandaag.split("-").map(Number);
  const lijst: PeriodeOptie[] = [];
  if (tijdvak === "kwartaal") {
    let jaarNu = j;
    let q = Math.floor((m - 1) / 3) + 1;
    for (let i = 0; i < 8; i++) {
      lijst.push(kwartaal(jaarNu, q));
      q -= 1;
      if (q === 0) {
        q = 4;
        jaarNu -= 1;
      }
    }
  } else if (tijdvak === "maand") {
    let jaarNu = j;
    let maandNu = m;
    for (let i = 0; i < 13; i++) {
      lijst.push(maand(jaarNu, maandNu));
      maandNu -= 1;
      if (maandNu === 0) {
        maandNu = 12;
        jaarNu -= 1;
      }
    }
  } else {
    for (let i = 0; i < 4; i++) lijst.push(jaar(j - i));
  }
  // lopend tijdvak = lijst[0] (einde ligt na vandaag of op vandaag); het laatst afgesloten is het eerste dat voor vandaag eindigt
  const afgesloten = lijst.find((o) => o.einde < vandaag);
  return lijst.map((o) => (o === afgesloten ? { ...o, isAangifte: true } : o));
}

export function standaardPeriode(opties: PeriodeOptie[]): string {
  return (opties.find((o) => o.isAangifte) ?? opties[0]).sleutel;
}

// Altijd ook de gewone jaren en "alles", ook als je tijdvak maand of kwartaal is.
export function alleKeuzes(tijdvak: Tijdvak, vandaag: string, jaren: string[]): PeriodeOptie[] {
  const opties = periodeOpties(tijdvak, vandaag);
  const jaarOpties = [...new Set(jaren)].sort().reverse().map((y) => jaar(Number(y)));
  return [...opties, ...(tijdvak === "jaar" ? [] : jaarOpties)];
}

export function vindPeriode(opties: PeriodeOptie[], sleutel: string | null | undefined): PeriodeOptie | null {
  return opties.find((o) => o.sleutel === sleutel) ?? null;
}

// De sleutel van het tijdvak waar een BTW-periode (begin = eerste dag) bij hoort, om naar de controle te kunnen linken.
export function periodeSleutel(tijdvak: Tijdvak, begin: string): string {
  const [j, m] = begin.split("-").map(Number);
  if (tijdvak === "kwartaal") return `kwartaal-${j}-q${Math.floor((m - 1) / 3) + 1}`;
  if (tijdvak === "maand") return `maand-${j}-${p2(m)}`;
  return `jaar-${j}`;
}

export function inPeriode(datum: string, p: Pick<PeriodeOptie, "begin" | "einde">): boolean {
  return datum >= p.begin && datum <= p.einde;
}
