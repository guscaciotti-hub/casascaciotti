-- Separa pagamento de fatura de gasto.
--
-- A fatura do cartão lista, junto com as compras, os pagamentos que você fez
-- da fatura anterior. Eles vêm com sinal negativo, e somá-los ao mês zera o
-- gasto: uma fatura de R$ 13.500 com R$ 12.900 em pagamentos apareceria como
-- R$ 600 de gasto no mês. Errado — pagar o cartão é transferência, não
-- consumo.
--
-- Estorno de compra é diferente e continua abatendo: se a loja devolveu o
-- dinheiro, a casa de fato gastou menos.
--
-- `is_payment` marca só os pagamentos da própria fatura. Eles ficam no
-- histórico (é preciso saber quanto foi pago e quando), mas ficam fora do
-- gasto do mês, da divisão por categoria e da fila de revisão — não há o que
-- revisar num pagamento.

alter table public.transactions
  add column if not exists is_payment boolean not null default false;

create index if not exists transactions_is_payment_idx
  on public.transactions (is_payment) where is_payment = false;

comment on column public.transactions.is_payment is
  'Pagamento da própria fatura. Fica fora do gasto do mês e da fila de revisão.';

-- `create or replace` não aceita coluna nova no meio da lista (o `t.*` cresceu),
-- então a view é derrubada e recriada.
drop view if exists public.transactions_monthly;

create view public.transactions_monthly
with (security_invoker = on) as
select
  t.*,
  coalesce(s.reference_month, date_trunc('month', t.transaction_date)::date) as reference_month,
  s.source as statement_source
from public.transactions t
left join public.statements s on s.id = t.statement_id;
