-- Casa Scaciotti — schema inicial
-- Sistema de controle financeiro doméstico para duas pessoas com acesso igual.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  color          text not null default '#64748b',
  icon           text not null default 'circle',
  monthly_budget numeric(12, 2),
  is_essential   boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- merchants — estabelecimento com nome amigavel
-- ---------------------------------------------------------------------------
create table if not exists public.merchants (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  category_id  uuid references public.categories (id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists merchants_category_id_idx on public.merchants (category_id);

-- ---------------------------------------------------------------------------
-- merchant_rules — coracao da categorizacao automatica
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.match_type as enum ('exact', 'contains', 'regex');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.merchant_rules (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  pattern     text not null,
  match_type  public.match_type not null default 'contains',
  priority    integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint merchant_rules_pattern_not_blank check (length(btrim(pattern)) > 0),
  constraint merchant_rules_unique_pattern unique (merchant_id, pattern, match_type)
);

create index if not exists merchant_rules_active_idx on public.merchant_rules (active, priority);

-- ---------------------------------------------------------------------------
-- statements — cada fatura / PDF importado
-- ---------------------------------------------------------------------------
create table if not exists public.statements (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  reference_month date not null,
  file_name       text,
  file_url        text,
  total_amount    numeric(12, 2),
  due_date        date,
  imported_at     timestamptz not null default now(),
  imported_by     uuid references auth.users (id) on delete set null,
  constraint statements_reference_month_is_first_day check (extract(day from reference_month) = 1)
);

create index if not exists statements_reference_month_idx on public.statements (reference_month desc);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  statement_id           uuid references public.statements (id) on delete cascade,
  transaction_date       date not null,
  raw_description        text not null,
  normalized_description text not null default '',
  amount                 numeric(12, 2) not null,
  installment_current    integer,
  installment_total      integer,
  merchant_id            uuid references public.merchants (id) on delete set null,
  category_id            uuid references public.categories (id) on delete set null,
  is_reviewed            boolean not null default false,
  dedupe_hash            text not null unique,
  notes                  text,
  created_at             timestamptz not null default now()
);

create index if not exists transactions_statement_id_idx on public.transactions (statement_id);
create index if not exists transactions_date_idx on public.transactions (transaction_date desc);
create index if not exists transactions_category_id_idx on public.transactions (category_id);
create index if not exists transactions_merchant_id_idx on public.transactions (merchant_id);
create index if not exists transactions_unreviewed_idx on public.transactions (is_reviewed) where is_reviewed = false;

-- ---------------------------------------------------------------------------
-- fixed_bills — contas fixas mensais
-- ---------------------------------------------------------------------------
create table if not exists public.fixed_bills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  amount      numeric(12, 2) not null default 0,
  due_day     integer not null check (due_day between 1 and 31),
  category_id uuid references public.categories (id) on delete set null,
  is_autopay  boolean not null default false,
  is_active   boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bill_payments — status de pagamento por mes
-- ---------------------------------------------------------------------------
create table if not exists public.bill_payments (
  id              uuid primary key default gen_random_uuid(),
  fixed_bill_id   uuid not null references public.fixed_bills (id) on delete cascade,
  reference_month date not null,
  is_paid         boolean not null default false,
  paid_at         timestamptz,
  amount_paid     numeric(12, 2),
  constraint bill_payments_unique unique (fixed_bill_id, reference_month),
  constraint bill_payments_reference_month_is_first_day check (extract(day from reference_month) = 1)
);

create index if not exists bill_payments_month_idx on public.bill_payments (reference_month);

-- ---------------------------------------------------------------------------
-- savings_accounts
-- ---------------------------------------------------------------------------
create table if not exists public.savings_accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  institution     text,
  goal_amount     numeric(12, 2),
  current_balance numeric(12, 2) not null default 0,
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- savings_snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.savings_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  savings_account_id  uuid not null references public.savings_accounts (id) on delete cascade,
  balance             numeric(12, 2) not null,
  snapshot_date       date not null default current_date,
  created_at          timestamptz not null default now(),
  constraint savings_snapshots_unique_per_day unique (savings_account_id, snapshot_date)
);

create index if not exists savings_snapshots_date_idx on public.savings_snapshots (snapshot_date);

-- ---------------------------------------------------------------------------
-- RLS: dois usuarios, mesmos privilegios. Autenticado le e escreve tudo.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'merchants', 'merchant_rules', 'statements', 'transactions',
    'fixed_bills', 'bill_payments', 'savings_accounts', 'savings_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado para os PDFs das faturas
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

drop policy if exists "statements_authenticated_all" on storage.objects;
create policy "statements_authenticated_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'statements')
  with check (bucket_id = 'statements');
