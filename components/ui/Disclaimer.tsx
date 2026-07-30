export const APP_DISCLAIMER =
  "Deze applicatie is een hulpmiddel voor eigen administratie en vervangt geen professioneel financieel/fiscaal advies.";

export const DASHBOARD_DISCLAIMER =
  "Dit is een samenvatting op basis van wat je hebt geüpload en opgegeven — geen officiële belastingaangifte.";

export const TIP_DISCLAIMER = "Algemene suggesties op basis van je cijfers, geen persoonlijk advies.";

export const RISK_WARNING_PREFIX =
  "Deze uitgave sluit mogelijk niet goed aan bij je opgegeven bedrijfsactiviteiten.";

export const RISK_WARNING_SUFFIX =
  "Je kunt deze op eigen risico toch opslaan als zakelijke kostenpost. Dit is geen belastingadvies — raadpleeg bij twijfel een boekhouder of de Belastingdienst.";

export const BTW_INDICATIE_DISCLAIMER = "Dit is een indicatie, geen officiële BTW-aangifte.";

export const BELASTING_INDICATIE_DISCLAIMER =
  "Dit is een indicatie op basis van de huidige tarieven, geen officiële belastingaangifte.";

export function FooterDisclaimer() {
  return (
    <footer className="border-t border-line bg-paper-dark px-6 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <p className="mx-auto max-w-5xl text-center text-xs leading-relaxed text-muted">{APP_DISCLAIMER}</p>
    </footer>
  );
}
