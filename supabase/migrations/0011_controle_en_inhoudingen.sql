-- Boekhouder Mes — administratiecontrole die actueel blijft + ingehouden kosten bij hun factuur
-- Voer dit uit in de Supabase SQL editor, na 0010. Veilig om twee keer uit te voeren.

-- 1. De volledige uitkomst van de controle-scan bewaren, zodat de verschillen altijd opnieuw berekend worden tegen wat er
--    NU is opgeslagen. Pas je een boeking later zelf aan, dan verdwijnt het verschil vanzelf.
alter table document_controles add column if not exists scan jsonb;

-- 2. Een ingehouden kost (bijv. factoring) hoort bij de factuur waarop hij is ingehouden. Verwijder je die factuur,
--    dan gaat de ingehouden kost er automatisch mee weg.
alter table transactions add column if not exists ingehouden_op uuid references transactions(id) on delete cascade;
create index if not exists transactions_ingehouden_op_idx on transactions(ingehouden_op);

-- 3. Bestaande ingehouden kosten (die de app eerder als aparte kostenpost bij hetzelfde document boekte) alsnog koppelen
--    aan hun verkoopfactuur: dezelfde gebruiker, hetzelfde document, de grootste omzetboeking van dat document.
update transactions k
set ingehouden_op = (
  select m.id
  from transactions m
  where m.user_id = k.user_id
    and m.document_id = k.document_id
    and m.type = 'omzet'
  order by m.bedrag_incl_btw desc
  limit 1
)
where k.ingehouden_op is null
  and k.type = 'kosten'
  and k.document_id is not null
  and k.omschrijving like '%— ingehouden op%';
