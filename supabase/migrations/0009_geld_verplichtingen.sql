-- Boekhouder Mes — Money mode: verplichtingen met een deadline (achterstanden, aanmaningen, terugbetalingen)
-- Voer dit uit in de Supabase SQL editor, na 0008. Veilig om twee keer uit te voeren.

create table if not exists geld_verplichtingen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null,
  -- wat je nog moet betalen
  bedrag numeric(12, 2) not null check (bedrag > 0),
  deadline date not null,
  -- bij wie of waarvoor, bijv. "Belastingdienst" of "Toeslagen"
  instantie text,
  notitie text,
  -- gevuld zodra je het hebt betaald; dan stoppen de herinneringen
  betaald_op date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists geld_verplichtingen_user_deadline_idx on geld_verplichtingen(user_id, deadline);

drop trigger if exists geld_verplichtingen_set_updated_at on geld_verplichtingen;
create trigger geld_verplichtingen_set_updated_at before update on geld_verplichtingen
  for each row execute function set_updated_at();

alter table geld_verplichtingen enable row level security;
drop policy if exists "geld_verplichtingen_own" on geld_verplichtingen;
create policy "geld_verplichtingen_own" on geld_verplichtingen for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
