-- Recados da casa.
--
-- A comunicação sobre dinheiro estava espalhada em WhatsApp: "me manda a
-- fatura do Nubank", "já pagou a escola?". Fora do sistema, some no meio de
-- conversa e ninguém acha depois. Aqui fica junto do que a conversa é sobre.
--
-- São duas pessoas, então não há salas nem destinatário: uma conversa só, e
-- toda mensagem é para a outra pessoa. Inventar caixa de entrada aqui seria
-- estrutura sem uso.

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  -- O nome fica gravado junto: a mensagem tem que continuar legível mesmo se
  -- a conta for apagada, e uma leitura do histórico não deve depender de
  -- consultar auth.users linha a linha.
  author_name text not null,
  body        text not null check (length(btrim(body)) > 0),
  -- Um pedido é uma mensagem que espera resposta ("me manda a fatura").
  -- Fica pendente até alguém marcar como feito — é o que o sininho cobra.
  is_request  boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_pending_requests_idx
  on public.messages (created_at desc)
  where is_request and done_at is null;

-- ---------------------------------------------------------------------------
-- Marca de leitura
-- ---------------------------------------------------------------------------
-- Uma linha por pessoa, com o instante em que ela viu a conversa pela última
-- vez. O não lido é "mensagem da outra pessoa mais nova que isso" — barato de
-- calcular e não exige uma linha de status por mensagem por pessoa.
create table if not exists public.message_reads (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: mesma regra do resto do sistema — duas pessoas, acesso igual.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages', 'message_reads']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
