-- Boekhouder Mes — leveranciers-geheugen + chat "Mes"
-- Voer dit uit in de Supabase SQL editor, na 0001-0003.

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null,
  naam_genormaliseerd text not null,
  laatst_categorie text,
  laatst_type text,
  keer_gezien integer not null default 1,
  laatst_gebruikt timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, naam_genormaliseerd)
);

alter table suppliers enable row level security;
create policy "suppliers_select_own" on suppliers for select using (auth.uid() = user_id);
create policy "suppliers_insert_own" on suppliers for insert with check (auth.uid() = user_id);
create policy "suppliers_update_own" on suppliers for update using (auth.uid() = user_id);

create index suppliers_user_id_idx on suppliers(user_id);
create index suppliers_naam_genormaliseerd_idx on suppliers(user_id, naam_genormaliseerd);

create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titel text not null default 'Nieuw gesprek',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table chat_conversations enable row level security;
create policy "chat_conversations_select_own" on chat_conversations for select using (auth.uid() = user_id);
create policy "chat_conversations_insert_own" on chat_conversations for insert with check (auth.uid() = user_id);
create policy "chat_conversations_update_own" on chat_conversations for update using (auth.uid() = user_id);
create policy "chat_conversations_delete_own" on chat_conversations for delete using (auth.uid() = user_id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;

-- RLS op chat_messages controleert eigendom via de bijbehorende conversation (geen eigen user_id-kolom nodig).
create policy "chat_messages_select_own" on chat_messages for select
  using (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "chat_messages_insert_own" on chat_messages for insert
  with check (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create index chat_conversations_user_id_idx on chat_conversations(user_id);
create index chat_messages_conversation_id_idx on chat_messages(conversation_id);
