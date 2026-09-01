-- View que resolve o "mês do gasto" de cada lançamento.
--
-- Uma fatura de março traz compras feitas em fevereiro. Para o dashboard, o que
-- importa é o mês da fatura — é quando o dinheiro sai. Lançamentos manuais não
-- têm fatura, então caem no mês da própria data.
--
-- `security_invoker = on` faz a view respeitar o RLS das tabelas de origem.

create or replace view public.transactions_monthly
with (security_invoker = on) as
select
  t.*,
  coalesce(s.reference_month, date_trunc('month', t.transaction_date)::date) as reference_month,
  s.source as statement_source
from public.transactions t
left join public.statements s on s.id = t.statement_id;
