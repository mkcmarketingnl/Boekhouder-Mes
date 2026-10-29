import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Aangifte, RubriekBron } from "@/lib/btwAangifte";

// Uitleg per rubriek, in gewone taal. De codes en namen zijn die van het echte aangifteformulier, zodat een
// nieuwe ondernemer ze herkent wanneer hij of zij de aangifte straks echt invult.
interface RubriekUitleg {
  code: string;
  titel: string;
  uitleg: string;
}

const UITLEG: Record<string, RubriekUitleg> = {
  "1a": {
    code: "1a",
    titel: "Leveringen/diensten belast met hoog tarief (21%)",
    uitleg:
      "Hier komt je omzet waarover je 21% BTW rekende — de meeste diensten en producten. Links staat het bedrag zonder BTW (de “grondslag”), rechts de BTW die je daarover aan je klanten hebt gerekend (de “omzetbelasting”).",
  },
  "1b": {
    code: "1b",
    titel: "Leveringen/diensten belast met laag tarief (9%)",
    uitleg:
      "Hetzelfde als 1a, maar voor omzet waarover je 9% BTW rekende (het lage tarief), bijvoorbeeld voor eten en drinken uit de winkel, boeken of kapper.",
  },
  "1c": {
    code: "1c",
    titel: "Leveringen/diensten belast met overige tarieven, behalve 0%",
    uitleg: "Omzet met een ander BTW-tarief dan 21%, 9% of 0%. Dit komt bijna nooit voor.",
  },
  "1d": {
    code: "1d",
    titel: "Privégebruik",
    uitleg:
      "Gebruik je iets uit je bedrijf ook privé (bijvoorbeeld een zakelijke auto of laptop)? Dan moet je over dat privégebruik BTW afdragen. Deze app houdt dat niet bij: geldt dit voor jou, vul het dan zelf in.",
  },
  "1e": {
    code: "1e",
    titel: "Leveringen/diensten belast met 0% of niet bij u belast",
    uitleg:
      "Omzet zonder BTW: omzet met 0%-tarief, of omzet waarover jij geen BTW rekent. Hier staat alleen het bedrag, geen BTW. Let op: verkoop aan klanten in het buitenland hoort vaak in rubriek 3, niet hier — controleer dat als je buitenlandse klanten hebt.",
  },
  "2a": {
    code: "2a",
    titel: "Leveringen/diensten waarbij de omzetbelasting naar u is verlegd",
    uitleg:
      "Soms hoeft niet jij maar je klant de BTW aan de Belastingdienst af te dragen (“verlegd”), bijvoorbeeld tussen aannemers in de bouw. Rekende jij bij zo’n verkoop zelf geen BTW? Dan hoort het bedrag hier. Deze app houdt dat niet bij.",
  },
  "3a": {
    code: "3a",
    titel: "Leveringen naar landen buiten de EU (uitvoer)",
    uitleg: "Producten die je aan klanten buiten de Europese Unie verkoopt en verstuurt. Deze app houdt dat niet apart bij.",
  },
  "3b": {
    code: "3b",
    titel: "Leveringen naar of diensten in landen binnen de EU",
    uitleg:
      "Zakelijke verkoop aan klanten in een ander EU-land (meestal zonder Nederlandse BTW). Heb je dit? Dan moet je vaak ook een aparte “opgaaf intracommunautaire prestaties” doen. Deze app houdt dat niet apart bij.",
  },
  "3c": {
    code: "3c",
    titel: "Installatie/afstandsverkopen binnen de EU",
    uitleg: "Producten die je vanuit Nederland aan consumenten in andere EU-landen verkoopt (bijv. een webshop). Deze app houdt dat niet apart bij.",
  },
  "4a": {
    code: "4a",
    titel: "Leveringen/diensten uit landen buiten de EU",
    uitleg:
      "Koop je zakelijk iets van een leverancier buiten de EU die geen Nederlandse BTW rekent (bijvoorbeeld software of advertenties)? Dan moet jij de BTW zelf aangeven (verlegd naar jou). Je mag diezelfde BTW meestal ook weer terugvragen als voorbelasting (5b) — per saldo vaak € 0.",
  },
  "4b": {
    code: "4b",
    titel: "Leveringen/diensten uit landen binnen de EU",
    uitleg:
      "Hetzelfde als 4a, maar voor leveranciers in een ander EU-land (bijvoorbeeld een abonnement van een Iers of Duits bedrijf zonder Nederlandse BTW).",
  },
  "5d": {
    code: "5d",
    titel: "Vermindering volgens de kleineondernemersregeling (KOR)",
    uitleg:
      "Gebruik je de KOR? Dan betaal je soms minder of geen BTW. Deze app berekent de KOR niet; gebruik je de regeling, vul dit dan volgens de Belastingdienst in.",
  },
  "5e": {
    code: "5e",
    titel: "Schatting vorige aangifte(n)",
    uitleg: "Alleen invullen als je in een eerdere aangifte een bedrag hebt geschat en dat nu wilt corrigeren.",
  },
  "5f": {
    code: "5f",
    titel: "Schatting deze aangifte",
    uitleg: "Alleen invullen als je voor deze aangifte nog niet alles precies weet en een deel moet schatten.",
  },
};

const GEEN_DATA_RUBRIEKEN = ["1d", "2a", "3a", "3b", "3c", "4a", "4b", "5d", "5e", "5f"];

const WOORDENLIJST: { term: string; uitleg: string }[] = [
  {
    term: "Omzetbelasting (BTW over je verkopen)",
    uitleg:
      "De BTW die jij aan je klanten rekent en die van jou is om aan de Belastingdienst af te dragen. Op het formulier heet dit “verschuldigde omzetbelasting” (rubriek 5a). In gewone taal: de BTW die je moet afdragen.",
  },
  {
    term: "Voorbelasting (BTW over je kosten)",
    uitleg:
      "De BTW die jij zelf betaalt over zakelijke aankopen. Die mag je (meestal) terugvragen van de Belastingdienst, dus je trekt het af van de BTW die je moet afdragen (rubriek 5b).",
  },
  {
    term: "Grondslag",
    uitleg: "Het bedrag waarover BTW wordt berekend: je omzet zonder BTW.",
  },
  {
    term: "Hoog tarief, laag tarief, 0%",
    uitleg:
      "In Nederland is het gewone BTW-tarief 21% (hoog), voor sommige zaken geldt 9% (laag) en voor een paar dingen 0%. Welk tarief geldt, staat op je facturen en bonnen.",
  },
  {
    term: "Tijdvak",
    uitleg:
      "De periode waarover je aangifte doet: een maand, kwartaal of jaar. De meeste ondernemers doen elk kwartaal aangifte. Aangifte doen én betalen moet uiterlijk aan het eind van de maand na het tijdvak.",
  },
  {
    term: "Verlegd",
    uitleg: "De BTW wordt niet door de verkoper, maar door de koper aangegeven. Komt voor in de bouw en bij aankopen uit het buitenland.",
  },
];

export const eur = (n: number) => formatCurrency(n);

function BronLijst({ bronnen, toonPercentage = false }: { bronnen: RubriekBron[]; toonPercentage?: boolean }) {
  const MAX = 30;
  const zichtbaar = bronnen.slice(0, MAX);
  return (
    <div className="mt-2 rounded-md border border-line bg-white">
      <ul className="divide-y divide-line text-[12px]">
        {zichtbaar.map((b, i) => (
          <li key={b.id + ":" + b.percentage + ":" + i} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{b.leverancier}</div>
              <div className="text-[11px] text-muted">
                {formatDate(b.factuurdatum)}
                {b.factuurnummer ? ` · ${b.factuurnummer}` : ""}
                {toonPercentage ? ` · ${b.percentage}%-deel` : ""}
              </div>
            </div>
            <div className="mono shrink-0 text-right text-[11.5px] text-ink">
              <div>{eur(b.excl)} excl.</div>
              <div className="text-muted">{eur(b.btw)} BTW</div>
            </div>
          </li>
        ))}
      </ul>
      {bronnen.length > MAX && <p className="border-t border-line px-3 py-2 text-[11px] text-muted">… en nog {bronnen.length - MAX} andere</p>}
    </div>
  );
}

function Bedragen({ grondslag, btw, geenBtwKolom }: { grondslag: number | null; btw: number | null; geenBtwKolom?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-[13px]">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted">Omzet excl. BTW (grondslag)</div>
        <div className="mono mt-0.5 font-semibold text-ink">{eur(grondslag ?? 0)}</div>
      </div>
      {!geenBtwKolom && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">Omzetbelasting (BTW)</div>
          <div className="mono mt-0.5 font-semibold text-ink">{eur(btw ?? 0)}</div>
        </div>
      )}
    </div>
  );
}

function Rubriek({
  code,
  titel,
  uitleg,
  children,
  open,
}: {
  code: string;
  titel: string;
  uitleg: string;
  children?: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group rounded-md border border-line bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 px-3.5 py-3">
        <span className="mono mt-0.5 shrink-0 rounded bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-paper">{code}</span>
        <span className="text-[13.5px] font-semibold leading-snug text-ink">{titel}</span>
      </summary>
      <div className="space-y-3 border-t border-line px-3.5 py-3">
        <p className="text-[12.5px] leading-relaxed text-muted">{uitleg}</p>
        {children}
      </div>
    </details>
  );
}

export function BtwModus({
  aangifte,
  periodeLabel,
  uiterlijk,
  periodeLoopt,
  controle,
}: {
  aangifte: Aangifte;
  periodeLabel: string;
  uiterlijk: Date;
  periodeLoopt: boolean;
  // hoeveel documenten in dit tijdvak met de nieuwste scan zijn gecontroleerd; null als dat niet te bepalen is
  controle: { documenten: number; gecontroleerd: number; href: string } | null;
}) {
  const a = aangifte;
  const teBetalen = a.subtotaal >= 0;
  const heeftData = a.aantalOmzetFacturen + a.aantalKostenFacturen > 0;

  const rubriekRijen = (["1a", "1b", "1c", "1e"] as const).filter((c) => a.rubrieken[c].bronnen.length > 0);

  return (
    <div className="space-y-6">
      {/* Uitkomst */}
      <Card className={`p-5 ${teBetalen ? "" : "border-ok/40"}`}>
        <div className="text-[11.5px] uppercase tracking-wide text-muted">Rubriek 5g · totaal over {periodeLabel}</div>
        <div className="mono mt-1 text-3xl font-semibold text-ink">{eur(Math.abs(a.subtotaal))}</div>
        <p className={`mt-1 text-sm font-semibold ${teBetalen ? "text-stamp" : "text-ok"}`}>
          {heeftData ? (teBetalen ? "te betalen aan de Belastingdienst" : "terug te vragen van de Belastingdienst") : "nog geen facturen in deze periode"}
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Aangifte doen <strong className="text-ink">én</strong> betalen kan tot en met{" "}
          <strong className="text-ink">{formatDate(uiterlijk)}</strong>.
          {periodeLoopt && " Deze periode loopt nog: er kunnen nog facturen bijkomen, dus dit bedrag kan nog veranderen."}
        </p>
      </Card>

      {controle && controle.documenten > 0 && (
        <Card className={`p-4 ${controle.gecontroleerd < controle.documenten ? "border-warn/30 bg-warn-bg" : ""}`}>
          <p className="text-[13px] leading-relaxed">
            <strong>{controle.gecontroleerd} van {controle.documenten}</strong> documenten in {periodeLabel} zijn gecontroleerd met de nieuwste scan.{" "}
            {controle.gecontroleerd < controle.documenten
              ? "Doe de administratiecontrole vóór je aangifte, zodat bedragen en BTW-tarieven (ook 9% en 21% op één bon) zeker kloppen."
              : "Controleer eventuele verschillen nog even in de administratiecontrole."}
          </p>
          <Link href={controle.href} className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium underline">
            Naar de administratiecontrole
          </Link>
        </Card>
      )}

      {/* In gewone taal */}
      <Card className="p-5">
        <h2 className="display mb-3 text-[15px] font-semibold">In gewone taal</h2>
        <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink">
          <li>
            Over je <strong>verkopen</strong> hebben je klanten<span className="mono font-semibold">{eur(a.verschuldigd)}</span> BTW betaald.
            Die is van de Belastingdienst; jij draagt die af. Op het formulier heet dit{" "}
            <em>verschuldigde omzetbelasting</em> (rubriek 5a).
          </li>
          <li>
            Over je <strong>zakelijke kosten</strong> heb jij zelf <span className="mono font-semibold">{eur(a.voorbelasting)}</span> BTW
            betaald, en die mag je terugvragen. Op het formulier heet dit <em>voorbelasting</em> (rubriek 5b).
          </li>
          <li>
            Het <strong>verschil</strong> (5a min 5b) is wat je betaalt of terugkrijgt: rubriek 5c en 5g.
          </li>
        </ul>
      </Card>

      {/* Overzicht om over te nemen */}
      <section>
        <h2 className="display mb-1 text-[15px] font-semibold">Zo vul je het formulier in</h2>
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          Dit zijn de bedragen uit je facturen, per rubriek. Rubrieken die hier niet staan, vul je op € 0 (tenzij ze voor jou gelden — zie hieronder).
        </p>
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[3.25rem_1fr_auto_auto] items-center gap-x-3 border-b border-line bg-paper-dark px-3.5 py-2 text-[10.5px] uppercase tracking-wide text-muted">
            <span>Rubriek</span>
            <span />
            <span className="text-right">Omzet</span>
            <span className="text-right">BTW</span>
          </div>
          {rubriekRijen.length === 0 && <p className="px-3.5 py-4 text-[12.5px] text-muted">Nog geen omzet in deze periode.</p>}
          {rubriekRijen.map((c) => {
            const r = a.rubrieken[c];
            return (
              <div key={c} className="grid grid-cols-[3.25rem_1fr_auto_auto] items-center gap-x-3 border-b border-line px-3.5 py-2.5 text-[12.5px]">
                <span className="mono font-semibold text-ink">{c}</span>
                <span className="min-w-0 truncate text-muted">{UITLEG[c].titel.replace(/^Leveringen\/diensten belast met /, "")}</span>
                <span className="mono text-right text-ink">{eur(r.grondslag ?? 0)}</span>
                <span className="mono min-w-[4.5rem] text-right text-ink">{r.btw == null ? "—" : eur(r.btw)}</span>
              </div>
            );
          })}
          {[
            ["5a", "Verschuldigde omzetbelasting", a.verschuldigd],
            ["5b", "Voorbelasting", a.voorbelasting],
            ["5c", "Subtotaal (5a min 5b)", a.subtotaal],
          ].map(([c, t, v]) => (
            <div key={c as string} className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-3 border-b border-line px-3.5 py-2.5 text-[12.5px]">
              <span className="mono font-semibold text-ink">{c}</span>
              <span className="text-muted">{t}</span>
              <span className="mono text-right text-ink">{eur(v as number)}</span>
            </div>
          ))}
          <div className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-3 bg-paper-dark px-3.5 py-3 text-[13px] font-semibold">
            <span className="mono text-ink">5g</span>
            <span className="text-ink">{teBetalen ? "Totaal te betalen" : "Totaal terug te vragen"}</span>
            <span className="mono text-right text-ink">{eur(Math.abs(a.subtotaal))}</span>
          </div>
        </Card>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Het aangifteformulier werkt met hele euro’s; hoe je afrondt, geeft het formulier in Mijn Belastingdienst Zakelijk zelf aan. Hierboven staan de exacte bedragen met centen.
        </p>
      </section>

      {a.nietAftrekbaar.btw > 0 && (
        <Card className="border-warn/30 bg-warn-bg p-5">
          <h2 className="display mb-1.5 text-[15px] font-semibold">BTW die je niet mag terugvragen: {eur(a.nietAftrekbaar.btw)}</h2>
          <p className="text-[12.5px] leading-relaxed text-ink">
            Over <strong>eten en drinken in de horeca</strong> (ook een zakelijk etentje met een klant) mag je als ondernemer de BTW niet terugvragen. Die BTW telt daarom
            niet mee in rubriek 5b — en dus ook niet in het BTW-saldo op je dashboard.
          </p>
          <BronLijst bronnen={a.nietAftrekbaar.bronnen} toonPercentage />
        </Card>
      )}

      {a.nulProcentKosten.length > 0 && (
        <Card className="border-warn/30 bg-warn-bg p-5">
          <h2 className="display mb-1.5 text-[15px] font-semibold">Check even: kosten zonder BTW</h2>
          <p className="text-[12.5px] leading-relaxed text-ink">
            Bij deze kosten staat 0% BTW. Is het een buitenlandse leverancier (bijv. software of advertenties van buiten Nederland)? Dan moet je de BTW vaak zelf aangeven in rubriek 4a of 4b
            (en mag je dezelfde BTW weer terugvragen in 5b). Per saldo is dat meestal € 0, maar de bedragen horen wél op de aangifte.
          </p>
          <BronLijst bronnen={a.nulProcentKosten} />
        </Card>
      )}

      {/* Uitleg per rubriek */}
      <section>
        <h2 className="display mb-3 text-[15px] font-semibold">Wat betekent elke rubriek?</h2>
        <div className="space-y-2.5">
          {(["1a", "1b", "1c", "1e"] as const).map((c) => {
            const r = a.rubrieken[c];
            const u = UITLEG[c];
            if (r.bronnen.length === 0 && (c === "1c" || c === "1e")) return null;
            return (
              <Rubriek key={c} code={c} titel={u.titel} uitleg={u.uitleg} open={r.bronnen.length > 0 && c === "1a"}>
                <Bedragen grondslag={r.grondslag} btw={r.btw} geenBtwKolom={c === "1e"} />
                {r.bronnen.length > 0 ? (
                  <details>
                    <summary className="min-h-11 cursor-pointer text-[12.5px] font-medium text-ink underline">Welke facturen zitten hierin? ({r.bronnen.length})</summary>
                    <BronLijst bronnen={r.bronnen} toonPercentage />
                  </details>
                ) : (
                  <p className="text-[12px] text-muted">Geen facturen in deze rubriek in deze periode.</p>
                )}
              </Rubriek>
            );
          })}
          <Rubriek
            code="5a"
            titel="Verschuldigde omzetbelasting (rubrieken 1a t/m 4b)"
            uitleg="De BTW uit alle rubrieken hierboven bij elkaar opgeteld: dit is de BTW die je over je verkopen moet afdragen."
          >
            <p className="mono text-[13px] font-semibold text-ink">{eur(a.verschuldigd)}</p>
          </Rubriek>
          <Rubriek
            code="5b"
            open
            titel="Voorbelasting"
            uitleg="De BTW die je zelf hebt betaald over zakelijke aankopen en die je mag terugvragen. Niet alle BTW mag je terugvragen (zie het kader ‘BTW die je niet mag terugvragen’, als dat hierboven staat)."
          >
            <p className="mono text-[13px] font-semibold text-ink">{eur(a.voorbelasting)}</p>
            {a.voorbelastingBronnen.length > 0 ? (
              <details open>
                <summary className="min-h-11 cursor-pointer text-[12.5px] font-medium text-ink underline">Welke kostenfacturen zitten hierin? ({a.voorbelastingBronnen.length})</summary>
                <BronLijst bronnen={a.voorbelastingBronnen} toonPercentage />
              </details>
            ) : (
              <p className="text-[12px] text-muted">Geen kostenfacturen met aftrekbare BTW in deze periode.</p>
            )}
          </Rubriek>
          <Rubriek
            code="5c"
            titel="Subtotaal (5a min 5b)"
            uitleg="Verschuldigde BTW min voorbelasting. Is dit bedrag positief, dan betaal je; is het negatief, dan krijg je geld terug."
          >
            <p className="mono text-[13px] font-semibold text-ink">{eur(a.subtotaal)}</p>
          </Rubriek>
          <Rubriek
            code="5g"
            titel="Totaal te betalen / terug te vragen"
            uitleg="Het eindbedrag van de aangifte: 5c, min een eventuele KOR-vermindering (5d), en met eventuele schattingen (5e, 5f). Zonder KOR en schattingen is dit gelijk aan 5c."
          >
            <p className="mono text-[13px] font-semibold text-ink">{eur(a.subtotaal)}</p>
          </Rubriek>
        </div>
      </section>

      <section>
        <h2 className="display mb-1 text-[15px] font-semibold">Rubrieken die niet uit je facturen komen</h2>
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
          Deze rubrieken kan de app niet uit je facturen halen. Voor de meeste ondernemers is het antwoord € 0 — maar lees even of het voor jou geldt.
        </p>
        <div className="space-y-2.5">
          {GEEN_DATA_RUBRIEKEN.map((c) => (
            <Rubriek key={c} code={UITLEG[c].code} titel={UITLEG[c].titel} uitleg={UITLEG[c].uitleg} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="display mb-3 text-[15px] font-semibold">Woordenlijst</h2>
        <div className="space-y-2">
          {WOORDENLIJST.map((w) => (
            <details key={w.term} className="rounded-md border border-line bg-white">
              <summary className="min-h-11 cursor-pointer list-none px-3.5 py-3 text-[13px] font-semibold text-ink">{w.term}</summary>
              <p className="border-t border-line px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">{w.uitleg}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="display mb-2 text-[15px] font-semibold">Zo doe je de aangifte echt</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
          <li>Log in bij <strong className="text-ink">Mijn Belastingdienst Zakelijk</strong> (met eHerkenning of DigiD zakelijk).</li>
          <li>Kies de aangifte omzetbelasting voor het juiste tijdvak.</li>
          <li>Neem de bedragen hierboven over, rubriek voor rubriek.</li>
          <li>Controleer het eindbedrag (5g), dien de aangifte in en betaal vóór de uiterste datum.</li>
        </ol>
      </section>
    </div>
  );
}
