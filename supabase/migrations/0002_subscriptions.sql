-- Boekhouder Mes — abonnementen (Stripe)
-- Voer dit uit in de Supabase SQL editor, na 0001_init.sql.

create table billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  is_comped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table billing enable row level security;

-- Alleen lezen van je eigen rij. Bewust GEEN insert/update/delete-policy voor de
-- authenticated-rol: schrijven gebeurt uitsluitend server-side via de Stripe-webhook
-- of de checkout-terugkeer-pagina, met de Supabase service-role key (bypasst RLS).
-- Zo kan een gebruiker zichzelf nooit gratis toegang geven via de browser.
create policy "billing_select_own" on billing for select using (auth.uid() = user_id);

create index billing_stripe_customer_id_idx on billing(stripe_customer_id);
