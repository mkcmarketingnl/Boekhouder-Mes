-- Boekhouder Mes — administratiecontrole: uitkomsten van het opnieuw scannen van al geüploade documenten
-- Voer dit uit in de Supabase SQL editor, na 0009. Veilig om twee keer uit te voeren. Raakt geen bestaande gegevens.

create table if not exists document_controles (
  document_id uuid primary key references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  uitslag text not null check (uitslag in ('klopt', 'afwijking', 'niet_zeker', 'mislukt')),
  -- gevonden verschillen met een voorstel om ze te herstellen
  bevindingen jsonb not null default '[]'::jsonb,
  scan_meldingen jsonb not null default '[]'::jsonb,
  scan_onzeker boolean not null default false,
  gecontroleerd_op timestamptz not null default now(),
  -- ids van bevindingen die de gebruiker heeft afgehandeld (hersteld of bewust zo gelaten)
  afgehandeld jsonb not null default '[]'::jsonb
);
create index if not exists document_controles_user_idx on document_controles(user_id, gecontroleerd_op desc);

alter table document_controles enable row level security;
drop policy if exists "document_controles_own" on document_controles;
create policy "document_controles_own" on document_controles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
