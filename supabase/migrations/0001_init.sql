-- Boekhouder Mes — initieel schema, RLS en storage policies
-- Voer dit uit in de Supabase SQL editor van je eigen project.

-- ============================================================
-- Enums
-- ============================================================
create type rechtsvorm_type as enum ('eenmanszaak', 'vof', 'bv', 'anders');
create type aangiftetijdvak_type as enum ('maand', 'kwartaal', 'jaar');
create type document_status as enum ('verwerkt', 'geflaggd', 'handmatig');
create type transactie_type as enum ('kosten', 'omzet');
create type risico_niveau as enum ('laag', 'midden', 'hoog');
create type invoerwijze_type as enum ('ai', 'handmatig');

-- ============================================================
-- Tables
-- ============================================================

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  voornaam text not null,
  bedrijfsnaam text not null,
  rechtsvorm rechtsvorm_type not null,
  activiteiten text not null,
  sbi_indicatie text,
  kvk_nummer text,
  btw_nummer text,
  standaard_btw_percentage integer not null default 21,
  aangiftetijdvak aangiftetijdvak_type not null default 'kwartaal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_url text not null,
  upload_datum timestamptz not null default now(),
  status document_status not null default 'verwerkt',
  ruwe_ai_output jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  factuurnummer text,
  factuurdatum date not null,
  leverancier text not null,
  omschrijving text,
  bedrag_incl_btw numeric(12, 2) not null,
  bedrag_excl_btw numeric(12, 2) not null,
  btw_bedrag numeric(12, 2) not null default 0,
  btw_percentage numeric(5, 2) not null default 21,
  type transactie_type not null default 'kosten',
  categorie text not null default 'Overig',
  risico risico_niveau not null default 'laag',
  risico_toelichting text,
  invoerwijze invoerwijze_type not null default 'handmatig',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gegenereerd_op timestamptz not null default now(),
  tip_tekst text not null,
  context_snapshot jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index documents_user_id_idx on documents(user_id);
create index transactions_user_id_idx on transactions(user_id);
create index transactions_document_id_idx on transactions(document_id);
create index transactions_factuurdatum_idx on transactions(factuurdatum);
create index ai_tips_user_id_idx on ai_tips(user_id);

-- ============================================================
-- updated_at trigger helper
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger documents_set_updated_at before update on documents
  for each row execute function set_updated_at();
create trigger transactions_set_updated_at before update on transactions
  for each row execute function set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table documents enable row level security;
alter table transactions enable row level security;
alter table ai_tips enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = user_id);
create policy "profiles_delete_own" on profiles for delete using (auth.uid() = user_id);

create policy "documents_select_own" on documents for select using (auth.uid() = user_id);
create policy "documents_insert_own" on documents for insert with check (auth.uid() = user_id);
create policy "documents_update_own" on documents for update using (auth.uid() = user_id);
create policy "documents_delete_own" on documents for delete using (auth.uid() = user_id);

create policy "transactions_select_own" on transactions for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on transactions for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on transactions for update using (auth.uid() = user_id);
create policy "transactions_delete_own" on transactions for delete using (auth.uid() = user_id);

create policy "ai_tips_select_own" on ai_tips for select using (auth.uid() = user_id);
create policy "ai_tips_insert_own" on ai_tips for insert with check (auth.uid() = user_id);
create policy "ai_tips_delete_own" on ai_tips for delete using (auth.uid() = user_id);

-- ============================================================
-- Storage: private bucket voor facturen/bonnen
-- Pad-conventie: {user_id}/{uuid}.{ext} — policies matchen op het
-- eerste pad-segment tegen auth.uid().
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_storage_select_own" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_storage_insert_own" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_storage_update_own" on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_storage_delete_own" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
