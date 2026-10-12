-- Boekhouder Mes — meerdere BTW-tarieven per bon + factuurmaker
-- Voer dit uit in de Supabase SQL editor, na 0001-0004. Veilig om twee keer uit te voeren.

-- ============================================================
-- 1. Meerdere BTW-tarieven op één bon/factuur
--    btw_regels is alleen gevuld bij 2 of meer tarieven, bijv.
--    [{"percentage":21,"bedrag_incl_btw":40,"bedrag_excl_btw":33.06,"btw_bedrag":6.94},
--     {"percentage":9, "bedrag_incl_btw":60,"bedrag_excl_btw":55.05,"btw_bedrag":4.95}]
--    bedrag_incl_btw / bedrag_excl_btw / btw_bedrag op de transactie blijven de TOTALEN (som van de regels),
--    zodat dashboard en BTW-saldo altijd kloppen.
-- ============================================================
alter table transactions add column if not exists btw_regels jsonb;

-- ============================================================
-- 2. Factuurinstellingen per gebruiker (bedrijfsgegevens voor op de factuur)
-- ============================================================
create table if not exists invoice_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  adres text,
  postcode text,
  plaats text,
  land text not null default 'Nederland',
  iban text,
  bic text,
  telefoon text,
  email text,
  website text,
  betaaltermijn_dagen integer not null default 14 check (betaaltermijn_dagen between 0 and 365),
  factuurnummer_prefix text not null default '',
  volgend_factuurnummer integer not null default 1 check (volgend_factuurnummer >= 1),
  standaard_template text not null default 'klassiek' check (standaard_template in ('klassiek', 'modern', 'minimaal')),
  standaard_notitie text,
  kor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. Verkoopfacturen
-- ============================================================
create table if not exists sales_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'concept' check (status in ('concept', 'definitief')),
  factuurnummer text not null,
  klant_naam text not null,
  klant_adres text,
  klant_postcode text,
  klant_plaats text,
  klant_land text not null default 'Nederland',
  klant_btw_nummer text,
  klant_kvk text,
  klant_email text,
  factuurdatum date not null,
  vervaldatum date not null,
  leverdatum date,
  -- [{"omschrijving":"...","aantal":1,"prijs_excl":100,"btw_percentage":21}]
  regels jsonb not null default '[]'::jsonb,
  btw_verlegd boolean not null default false,
  kor boolean not null default false,
  notitie text,
  template text not null default 'klassiek' check (template in ('klassiek', 'modern', 'minimaal')),
  -- momentopname van je bedrijfsgegevens op het moment dat de factuur definitief werd
  afzender jsonb,
  totaal_excl numeric(12, 2) not null default 0,
  totaal_btw numeric(12, 2) not null default 0,
  totaal_incl numeric(12, 2) not null default 0,
  transaction_id uuid references transactions(id) on delete set null,
  ai_controle jsonb,
  ai_controle_op timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, factuurnummer)
);

create index if not exists sales_invoices_user_id_idx on sales_invoices(user_id);
create index if not exists sales_invoices_factuurdatum_idx on sales_invoices(user_id, factuurdatum desc);

drop trigger if exists invoice_settings_set_updated_at on invoice_settings;
create trigger invoice_settings_set_updated_at before update on invoice_settings
  for each row execute function set_updated_at();
drop trigger if exists sales_invoices_set_updated_at on sales_invoices;
create trigger sales_invoices_set_updated_at before update on sales_invoices
  for each row execute function set_updated_at();

-- ============================================================
-- 4. Row Level Security
-- ============================================================
alter table invoice_settings enable row level security;
alter table sales_invoices enable row level security;

drop policy if exists "invoice_settings_select_own" on invoice_settings;
drop policy if exists "invoice_settings_insert_own" on invoice_settings;
drop policy if exists "invoice_settings_update_own" on invoice_settings;
create policy "invoice_settings_select_own" on invoice_settings for select using (auth.uid() = user_id);
create policy "invoice_settings_insert_own" on invoice_settings for insert with check (auth.uid() = user_id);
create policy "invoice_settings_update_own" on invoice_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sales_invoices_select_own" on sales_invoices;
drop policy if exists "sales_invoices_insert_own" on sales_invoices;
drop policy if exists "sales_invoices_update_own" on sales_invoices;
drop policy if exists "sales_invoices_delete_own_concept" on sales_invoices;
create policy "sales_invoices_select_own" on sales_invoices for select using (auth.uid() = user_id);
create policy "sales_invoices_insert_own" on sales_invoices for insert with check (auth.uid() = user_id);
create policy "sales_invoices_update_own" on sales_invoices for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Een definitieve factuur is een boekhoudkundig stuk: de inhoud wijzig je niet meer (maak zo nodig een nieuwe
-- factuur/creditnota). Alleen de AI-controle en de koppeling met je omzet mogen daarna nog worden bijgewerkt.
-- Dit dwingt de database zelf af, ook als iemand de app omzeilt.
create or replace function sales_invoices_guard() returns trigger as $$
begin
  if old.status = 'definitief' then
    if new.status <> 'definitief'
       or (to_jsonb(new) - 'ai_controle' - 'ai_controle_op' - 'transaction_id' - 'updated_at')
          is distinct from
          (to_jsonb(old) - 'ai_controle' - 'ai_controle_op' - 'transaction_id' - 'updated_at') then
      raise exception 'Een definitieve factuur kan niet meer worden gewijzigd';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists sales_invoices_guard_trg on sales_invoices;
create trigger sales_invoices_guard_trg before update on sales_invoices
  for each row execute function sales_invoices_guard();
-- en verwijder je ook niet: factuurnummers moeten aaneengesloten blijven. Alleen concepten kunnen weg.
create policy "sales_invoices_delete_own_concept" on sales_invoices for delete
  using (auth.uid() = user_id and status = 'concept');
