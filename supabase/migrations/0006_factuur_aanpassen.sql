-- Boekhouder Mes — definitieve facturen mogen worden aangepast
-- Voer dit uit in de Supabase SQL editor, na 0005. Veilig om twee keer uit te voeren.
--
-- Wat verandert: een definitieve factuur mag weer worden aangepast (klant, regels, datums, notitie ...).
-- Wat blijft vast: het factuurnummer, de eigenaar, en een definitieve factuur gaat niet terug naar concept.
-- De app bewaart bij elke wijziging de oude inhoud in "eerdere_versies" (controlespoor).

alter table sales_invoices add column if not exists eerdere_versies jsonb not null default '[]'::jsonb;
alter table sales_invoices add column if not exists gewijzigd_op timestamptz;

create or replace function sales_invoices_guard() returns trigger as $$
begin
  if old.status = 'definitief' then
    if new.status <> 'definitief'
       or new.factuurnummer is distinct from old.factuurnummer
       or new.user_id is distinct from old.user_id then
      raise exception 'Een definitieve factuur kan niet terug naar concept en houdt zijn factuurnummer';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
