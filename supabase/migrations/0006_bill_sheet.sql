-- Visão planilha das contas da casa.
--
-- A Renata controla as contas há anos numa planilha compartilhada, com estas
-- colunas: Tipo, Valor, Parcela, Vencimento, Status, Quem?, Pago em: e
-- Observações. O sistema precisa reproduzir a mesma mecânica, não uma
-- aproximação — trocar o jeito de trabalhar de quem já domina a ferramenta é
-- o caminho mais curto para o sistema não ser usado.
--
-- Quase toda coluna dela é *do mês*, não da conta: o valor do Nubank muda todo
-- mês, a parcela anda (9/12 vira 10/12), quem pagou varia. Por isso elas
-- entram em `bill_payments`, que já é a linha por (conta, mês), e não em
-- `fixed_bills`.
--
-- `bill_payments` deixa de significar "pagamento" e passa a significar "a
-- linha daquela conta naquele mês" — `is_paid` é só a caixinha de Status.

alter table public.bill_payments
  -- Coluna "Valor": o previsto do mês. `amount_paid` continua sendo o que saiu
  -- de fato; enquanto ninguém pagou, é este aqui que vale.
  add column if not exists amount_due  numeric(12, 2),
  -- Coluna "Parcela": texto livre, porque na planilha dela é "9/12", "-" ou
  -- vazio. Number não daria conta e obrigaria a inventar regra.
  add column if not exists installment text,
  -- Coluna "Vencimento": a data daquele mês. Sobrepõe `fixed_bills.due_day`,
  -- que vira só o padrão de quando a linha nasce.
  add column if not exists due_date    date,
  -- Coluna "Quem?": quem ficou de pagar.
  add column if not exists paid_by     text,
  -- Coluna "Pago em:": a data que ela digita, que não é necessariamente o
  -- instante em que marcou a caixinha (`paid_at`).
  add column if not exists paid_on     date,
  -- Coluna "Observações".
  add column if not exists notes       text;

comment on column public.bill_payments.amount_due is
  'Coluna "Valor" da planilha: o previsto do mês. Cai para fixed_bills.amount quando nulo.';
comment on column public.bill_payments.installment is
  'Coluna "Parcela". Texto livre ("9/12", "-", vazio).';
comment on column public.bill_payments.due_date is
  'Coluna "Vencimento" do mês. Sobrepõe fixed_bills.due_day.';
comment on column public.bill_payments.paid_by is 'Coluna "Quem?".';
comment on column public.bill_payments.paid_on is 'Coluna "Pago em:".';
comment on column public.bill_payments.notes is 'Coluna "Observações".';

-- ---------------------------------------------------------------------------
-- Ordem das linhas
-- ---------------------------------------------------------------------------
-- Numa planilha a linha fica onde a pessoa colocou. A ordenação por dia de
-- vencimento embaralharia a lista que ela conhece de cor — e metade das contas
-- dela nem tem vencimento preenchido.
alter table public.fixed_bills
  add column if not exists sort_order integer not null default 0;

comment on column public.fixed_bills.sort_order is
  'Posição da linha na planilha. Empate desempata por created_at.';

-- Dá uma ordem inicial estável às contas que já existem.
with numbered as (
  select id, row_number() over (order by due_day, name) * 10 as position
  from public.fixed_bills
)
update public.fixed_bills as b
   set sort_order = numbered.position
  from numbered
 where b.id = numbered.id
   and b.sort_order = 0;
