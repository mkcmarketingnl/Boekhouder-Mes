-- Boekhouder Mes — fiscale AI-tips
-- Voer dit uit in de Supabase SQL editor, na 0001_init.sql en 0002_subscriptions.sql.

create table ai_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gegenereerd_op timestamptz not null default now(),
  tip_tekst text not null,
  context_snapshot jsonb
);

alter table ai_tips enable row level security;

create policy "ai_tips_select_own" on ai_tips for select using (auth.uid() = user_id);
create policy "ai_tips_insert_own" on ai_tips for insert with check (auth.uid() = user_id);

create index ai_tips_user_id_idx on ai_tips(user_id);
