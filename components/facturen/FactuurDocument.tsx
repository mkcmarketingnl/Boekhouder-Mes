import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { berekenTotalen, btwVermelding, prijsExclWeergave, regelTotaalExcl, type Afzender, type FactuurGegevens, type FactuurTemplate } from "@/lib/facturen";

// Het factuurdocument zoals de klant het ziet. Eén component voor het voorbeeld in de editor, de detailpagina en
// het afdrukken/PDF. De drie templates verschillen alleen in opmaak; de gebruiker past alleen de gegevens aan.
export function FactuurDocument({
  gegevens,
  afzender,
  template,
  conceptStempel = false,
}: {
  gegevens: FactuurGegevens;
  afzender: Afzender;
  template: FactuurTemplate;
  conceptStempel?: boolean;
}) {
  const totalen = berekenTotalen(gegevens.regels, { btw_verlegd: gegevens.btw_verlegd, kor: gegevens.kor });
  const vermelding = btwVermelding(gegevens);
  const nulBtw = gegevens.btw_verlegd || gegevens.kor;
  const modern = template === "modern";
  const minimaal = template === "minimaal";

  const afzenderRegels = [
    afzender.adres,
    [afzender.postcode, afzender.plaats].filter(Boolean).join(" "),
    afzender.land && afzender.land !== "Nederland" ? afzender.land : null,
  ].filter(Boolean) as string[];
  const klantRegels = [
    gegevens.klant_adres,
    [gegevens.klant_postcode, gegevens.klant_plaats].filter(Boolean).join(" "),
    gegevens.klant_land && gegevens.klant_land !== "Nederland" ? gegevens.klant_land : null,
  ].filter(Boolean) as string[];

  return (
    <div
      id="factuur-print"
      className={cn(
        "relative w-full overflow-hidden rounded-md border border-line bg-white text-[12px] leading-relaxed text-ink print:rounded-none print:border-0",
        minimaal ? "text-[11.5px]" : ""
      )}
    >
      {conceptStempel && (
        <div className="pointer-events-none absolute right-4 top-4 rotate-6 rounded border-2 border-stamp px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-stamp opacity-70 print:hidden">
          Concept
        </div>
      )}

      {/* kop */}
      <div className={cn("px-5 pb-4 pt-5 sm:px-8", modern ? "bg-ink text-paper" : minimaal ? "" : "border-b-2 border-ink")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={cn("display break-words text-lg font-semibold", minimaal && "text-base")}>{afzender.bedrijfsnaam || "Jouw bedrijf"}</div>
            <div className={cn("mt-1 text-[11.5px]", modern ? "text-paper/75" : "text-muted")}>
              {afzenderRegels.map((r) => (
                <div key={r}>{r}</div>
              ))}
              {afzender.email && <div>{afzender.email}</div>}
              {afzender.telefoon && <div>{afzender.telefoon}</div>}
              {afzender.website && <div>{afzender.website}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className={cn("display text-xl font-semibold uppercase tracking-wide", minimaal && "text-base")}>Factuur</div>
            <div className={cn("mono mt-1 text-[11.5px]", modern ? "text-paper/75" : "text-muted")}>
              <div>Nr. {gegevens.factuurnummer || "—"}</div>
              <div>Datum {gegevens.factuurdatum ? formatDate(gegevens.factuurdatum) : "—"}</div>
              {gegevens.leverdatum && <div>Levering {formatDate(gegevens.leverdatum)}</div>}
              <div>Vervalt {gegevens.vervaldatum ? formatDate(gegevens.vervaldatum) : "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-8">
        {/* klant */}
        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wide text-muted">Factuur aan</div>
          <div className="mt-1 font-semibold">{gegevens.klant_naam || "—"}</div>
          {klantRegels.map((r) => (
            <div key={r}>{r}</div>
          ))}
          {gegevens.klant_btw_nummer && <div className="mono text-[11px] text-muted">BTW-nr. {gegevens.klant_btw_nummer}</div>}
          {gegevens.klant_kvk && <div className="mono text-[11px] text-muted">KVK {gegevens.klant_kvk}</div>}
        </div>

        {/* regels */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left">
            <thead>
              <tr className={cn("text-[10px] uppercase tracking-wide text-muted", !minimaal && "border-b border-line")}>
                <th className="py-2 pr-3 font-medium">Omschrijving</th>
                <th className="py-2 pr-3 text-right font-medium">Aantal</th>
                <th className="py-2 pr-3 text-right font-medium">Prijs</th>
                <th className="py-2 pr-3 text-right font-medium">BTW</th>
                <th className="py-2 text-right font-medium">Totaal excl.</th>
              </tr>
            </thead>
            <tbody>
              {gegevens.regels.map((r, i) => (
                <tr key={i} className={cn(!minimaal && "border-b border-line/70", modern && i % 2 === 1 && "bg-paper-dark/60")}>
                  <td className="py-2 pr-3 align-top">
                    {r.omschrijving || "—"}
                    {r.toelichting && <div className="mt-0.5 whitespace-pre-line text-[11px] text-muted">{r.toelichting}</div>}
                  </td>
                  <td className="mono py-2 pr-3 text-right align-top">{String(r.aantal).replace(".", ",")}</td>
                  <td className="mono py-2 pr-3 text-right align-top">{formatCurrency(prijsExclWeergave(r, nulBtw))}</td>
                  <td className="mono py-2 pr-3 text-right align-top">{gegevens.btw_verlegd || gegevens.kor ? "0%" : `${r.btw_percentage}%`}</td>
                  <td className="mono py-2 text-right align-top">{formatCurrency(regelTotaalExcl(r, nulBtw))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* totalen */}
        <div className="mt-4 flex justify-end">
          <div className="mono w-full max-w-[18rem] space-y-1 text-[12px]">
            <div className="flex justify-between">
              <span>Totaal excl. BTW</span>
              <span>{formatCurrency(totalen.excl)}</span>
            </div>
            {totalen.perTarief
              .filter((t) => t.percentage > 0 || totalen.perTarief.length === 1)
              .map((t) => (
                <div key={t.percentage} className="flex justify-between text-muted">
                  <span>
                    BTW {t.percentage}% over {formatCurrency(t.grondslag)}
                  </span>
                  <span>{formatCurrency(t.btw)}</span>
                </div>
              ))}
            <div className={cn("flex justify-between pt-1.5 text-[13px] font-semibold", modern ? "border-t-2 border-ink" : "border-t border-ink")}>
              <span>Totaal te betalen</span>
              <span>{formatCurrency(totalen.incl)}</span>
            </div>
          </div>
        </div>

        {vermelding && <p className="mt-4 rounded border border-line bg-paper-dark px-3 py-2 text-[11.5px]">{vermelding}</p>}

        {/* betaling & notitie */}
        <div className="mt-5 space-y-2 text-[11.5px]">
          <p>
            Wij verzoeken je het bedrag vóór <strong>{gegevens.vervaldatum ? formatDate(gegevens.vervaldatum) : "—"}</strong> over te maken
            {afzender.iban ? (
              <>
                {" "}
                op <span className="mono font-semibold">{afzender.iban.replace(/(.{4})/g, "$1 ").trim()}</span>
              </>
            ) : null}{" "}
            t.n.v. {afzender.bedrijfsnaam || "—"}, onder vermelding van <strong>{gegevens.factuurnummer || "het factuurnummer"}</strong>.
          </p>
          {gegevens.notitie && <p className="whitespace-pre-line text-muted">{gegevens.notitie}</p>}
        </div>
      </div>

      {/* voet */}
      <div className={cn("mono flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-[10.5px] sm:px-8", modern ? "bg-paper-dark text-muted" : "border-t border-line text-muted")}>
        {afzender.kvk_nummer && <span>KVK {afzender.kvk_nummer}</span>}
        {afzender.btw_nummer && <span>BTW {afzender.btw_nummer}</span>}
        {afzender.iban && <span>IBAN {afzender.iban}</span>}
        {afzender.bic && <span>BIC {afzender.bic}</span>}
      </div>
    </div>
  );
}
