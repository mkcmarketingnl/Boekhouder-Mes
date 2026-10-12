-- Boekhouder Mes — opgeslagen klanten voor de factuurmaker
-- Voer dit uit in de Supabase SQL editor, na 0005 (en 0006). Veilig om twee keer uit te voeren.

create table if not exists invoice_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null,
  adres text,
  postcode text,
  plaats text,
  land text not null default 'Nederland',
  btw_nummer text,
  kvk text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eén klant per naam (hoofdletterongevoelig) per gebruiker
create unique index if not exists invoice_customers_user_naam_idx on invoice_customers(user_id, lower(naam));
create index if not exists invoice_customers_user_id_idx on invoice_customers(user_id);

drop trigger if exists invoice_customers_set_updated_at on invoice_customers;
create trigger invoice_customers_set_updated_at before update on invoice_customers
  for each row execute function set_updated_at();

alter table invoice_customers enable row level security;

drop policy if exists "invoice_customers_select_own" on invoice_customers;
drop policy if exists "invoice_customers_insert_own" on invoice_customers;
drop policy if exists "invoice_customers_update_own" on invoice_customers;
drop policy if exists "invoice_customers_delete_own" on invoice_customers;
create policy "invoice_customers_select_own" on invoice_customers for select using (auth.uid() = user_id);
create policy "invoice_customers_insert_own" on invoice_customers for insert with check (auth.uid() = user_id);
create policy "invoice_customers_update_own" on invoice_customers for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoice_customers_delete_own" on invoice_customers for delete using (auth.uid() = user_id);
