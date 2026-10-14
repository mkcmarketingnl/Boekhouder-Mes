-- Boekhouder Mes — uren, betaalstatus, inkomstenbelasting-modus en Money mode
-- Voer dit uit in de Supabase SQL editor, na 0005, 0006 en 0007. Veilig om twee keer uit te voeren.
-- Raakt geen bestaande gegevens.

-- ============================================================
-- 1. Uren
-- ============================================================
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  datum date not null,
  klant_naam text not null,
  project text,
  omschrijving text,
  minuten integer not null check (minuten > 0 and minuten <= 1440),
  factureerbaar boolean not null default true,
  uurtarief numeric(10, 2) check (uurtarief is null or uurtarief >= 0),
  -- gezet zodra de uren op een factuur staan; wordt weer leeg als dat concept wordt weggegooid
  invoice_id uuid references sales_invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists time_entries_user_datum_idx on time_entries(user_id, datum desc);
create index if not exists time_entries_invoice_idx on time_entries(invoice_id);

drop trigger if exists time_entries_set_updated_at on time_entries;
create trigger time_entries_set_updated_at before update on time_entries
  for each row execute function set_updated_at();

-- Gefactureerde uren zijn vergrendeld: je kunt ze niet meer wijzigen (alleen loskoppelen gebeurt vanzelf
-- wanneer het factuurconcept verdwijnt). Dit dwingt de database af, ook als iemand de app omzeilt.
create or replace function time_entries_guard() returns trigger as $$
begin
  if old.invoice_id is not null and new.invoice_id is not null
     and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'Uren die op een factuur staan kunnen niet meer worden gewijzigd';
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists time_entries_guard_trg on time_entries;
create trigger time_entries_guard_trg before update on time_entries
  for each row execute function time_entries_guard();

alter table time_entries enable row level security;
drop policy if exists "time_entries_select_own" on time_entries;
drop policy if exists "time_entries_insert_own" on time_entries;
drop policy if exists "time_entries_update_own" on time_entries;
drop policy if exists "time_entries_delete_own_open" on time_entries;
create policy "time_entries_select_own" on time_entries for select using (auth.uid() = user_id);
create policy "time_entries_insert_own" on time_entries for insert with check (auth.uid() = user_id);
create policy "time_entries_update_own" on time_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "time_entries_delete_own_open" on time_entries for delete using (auth.uid() = user_id and invoice_id is null);

-- Standaard uurtarieven
alter table invoice_customers add column if not exists uurtarief numeric(10, 2);
alter table invoice_settings add column if not exists standaard_uurtarief numeric(10, 2);

-- ============================================================
-- 2. Betaalstatus van facturen
-- ============================================================
alter table sales_invoices add column if not exists betaald_op date;
alter table sales_invoices add column if not exists laatste_herinnering_op date;

-- ============================================================
-- 3. Inkomstenbelasting-modus: antwoorden per jaar
-- ============================================================
create table if not exists ib_antwoorden (
  user_id uuid not null references auth.users(id) on delete cascade,
  jaar integer not null check (jaar between 2020 and 2100),
  antwoorden jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, jaar)
);
drop trigger if exists ib_antwoorden_set_updated_at on ib_antwoorden;
create trigger ib_antwoorden_set_updated_at before update on ib_antwoorden
  for each row execute function set_updated_at();
alter table ib_antwoorden enable row level security;
drop policy if exists "ib_antwoorden_select_own" on ib_antwoorden;
drop policy if exists "ib_antwoorden_insert_own" on ib_antwoorden;
drop policy if exists "ib_antwoorden_update_own" on ib_antwoorden;
create policy "ib_antwoorden_select_own" on ib_antwoorden for select using (auth.uid() = user_id);
create policy "ib_antwoorden_insert_own" on ib_antwoorden for insert with check (auth.uid() = user_id);
create policy "ib_antwoorden_update_own" on ib_antwoorden for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 4. Money mode (strikt privé: alleen jijzelf kunt dit lezen)
-- ============================================================
create table if not exists geld_instellingen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- eigen schatting van je netto maandinkomen; leeg = automatisch uit je boekhouding
  inkomen_override_maand numeric(12, 2) check (inkomen_override_maand is null or inkomen_override_maand >= 0),
  -- mag de AI-chat Mes deze gegevens gebruiken? Standaard nee.
  mes_mag_lezen boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists geld_posten (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  soort text not null check (soort in ('vaste_last', 'schuld', 'speelruimte')),
  naam text not null,
  -- vaste last: maandbedrag; schuld: maandelijkse aflossing; speelruimte: maandbudget
  bedrag_maand numeric(12, 2) not null default 0 check (bedrag_maand >= 0),
  -- schuld: openstaand bedrag en jaarlijkse rente (%), einddatum optioneel
  restschuld numeric(12, 2) check (restschuld is null or restschuld >= 0),
  rente_percentage numeric(5, 2) check (rente_percentage is null or rente_percentage >= 0),
  einddatum date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists geld_posten_user_idx on geld_posten(user_id);
drop trigger if exists geld_posten_set_updated_at on geld_posten;
create trigger geld_posten_set_updated_at before update on geld_posten
  for each row execute function set_updated_at();

create table if not exists geld_uitgaven (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references geld_posten(id) on delete cascade,
  datum date not null,
  bedrag numeric(12, 2) not null check (bedrag > 0),
  notitie text,
  created_at timestamptz not null default now()
);
create index if not exists geld_uitgaven_user_datum_idx on geld_uitgaven(user_id, datum desc);

create table if not exists geld_doelen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null,
  soort text not null default 'sparen' check (soort in ('sparen', 'beleggen', 'overzicht')),
  doel_bedrag numeric(12, 2) check (doel_bedrag is null or doel_bedrag >= 0),
  huidig_bedrag numeric(12, 2) not null default 0 check (huidig_bedrag >= 0),
  streefdatum date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists geld_doelen_user_idx on geld_doelen(user_id);
drop trigger if exists geld_doelen_set_updated_at on geld_doelen;
create trigger geld_doelen_set_updated_at before update on geld_doelen
  for each row execute function set_updated_at();

alter table geld_instellingen enable row level security;
alter table geld_posten enable row level security;
alter table geld_uitgaven enable row level security;
alter table geld_doelen enable row level security;

drop policy if exists "geld_instellingen_own" on geld_instellingen;
drop policy if exists "geld_posten_own" on geld_posten;
drop policy if exists "geld_uitgaven_own" on geld_uitgaven;
drop policy if exists "geld_doelen_own" on geld_doelen;
create policy "geld_instellingen_own" on geld_instellingen for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "geld_posten_own" on geld_posten for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "geld_uitgaven_own" on geld_uitgaven for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "geld_doelen_own" on geld_doelen for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
