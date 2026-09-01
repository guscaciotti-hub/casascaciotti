-- Juros pagos numa conta fixa.
--
-- Contas como luz, água e telefone não têm valor fixo: o previsto em
-- `fixed_bills.amount` é só uma referência, e o que saiu de fato vai em
-- `amount_paid`. Quando a conta é paga em atraso, o juros entra separado —
-- assim dá para ver quanto a casa gastou de juros no ano sem confundir com o
-- valor da conta em si.
--
-- `amount_paid` guarda o total efetivamente pago, juros incluídos.

alter table public.bill_payments
  add column if not exists interest_paid numeric(12, 2);

comment on column public.bill_payments.amount_paid is
  'Total efetivamente pago no mês, já incluindo juros. Substitui fixed_bills.amount no cálculo.';
comment on column public.bill_payments.interest_paid is
  'Parcela de juros dentro de amount_paid. Nulo quando pago em dia.';
