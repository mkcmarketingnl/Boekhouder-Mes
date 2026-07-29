export type Rechtsvorm = "eenmanszaak" | "vof" | "bv" | "anders";
export type Aangiftetijdvak = "maand" | "kwartaal" | "jaar";
export type DocumentStatus = "verwerkt" | "geflaggd" | "handmatig";
export type TransactieType = "kosten" | "omzet";
export type RisicoNiveau = "laag" | "midden" | "hoog";
export type Invoerwijze = "ai" | "handmatig";
export type Leesbaarheid = "goed" | "slecht";

export interface Billing {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_comped: boolean;
  updated_at: string;
}

export const CATEGORIE_OPTIES = [
  "Kantoorbenodigdheden",
  "Software/abonnementen",
  "Reiskosten",
  "Marketing",
  "Horeca/representatie",
  "Inventaris",
  "Huur/werkruimte",
  "Overig",
] as const;

export type Categorie = (typeof CATEGORIE_OPTIES)[number];

export interface Profile {
  user_id: string;
  voornaam: string;
  bedrijfsnaam: string;
  rechtsvorm: Rechtsvorm;
  activiteiten: string;
  sbi_indicatie: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  standaard_btw_percentage: number;
  aangiftetijdvak: Aangiftetijdvak;
  created_at: string;
  updated_at: string;
}

export interface ExtractedInvoiceData {
  leverancier: string | null;
  factuurnummer: string | null;
  factuurdatum: string | null;
  bedrag_incl_btw: number | null;
  bedrag_excl_btw: number | null;
  btw_bedrag: number | null;
  btw_percentage: number | null;
  omschrijving: string | null;
  voorgestelde_categorie: Categorie | null;
  type: TransactieType | null;
  leesbaarheid: Leesbaarheid;
  risico: RisicoNiveau;
  risico_toelichting: string | null;
}

export interface DocumentRecord {
  id: string;
  user_id: string;
  file_url: string;
  upload_datum: string;
  status: DocumentStatus;
  ruwe_ai_output: ExtractedInvoiceData | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  document_id: string | null;
  user_id: string;
  factuurnummer: string | null;
  factuurdatum: string;
  leverancier: string;
  omschrijving: string | null;
  bedrag_incl_btw: number;
  bedrag_excl_btw: number;
  btw_bedrag: number;
  btw_percentage: number;
  type: TransactieType;
  categorie: string;
  risico: RisicoNiveau;
  risico_toelichting: string | null;
  invoerwijze: Invoerwijze;
  created_at: string;
  updated_at: string;
}

export interface AiTip {
  id: string;
  user_id: string;
  gegenereerd_op: string;
  tip_tekst: string;
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
}
