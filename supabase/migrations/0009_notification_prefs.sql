-- Preferências de aviso, por pessoa.
--
-- Duas informações moram aqui, e nenhuma delas pode morar no código: o
-- endereço de e-mail de cada um e o apelido pelo qual uma chama a outra. O
-- repositório é público — endereço de e-mail em arquivo versionado vira alvo
-- de coleta automatizada, e não há motivo para publicar o apelido da casa.
--
-- Também é a fonte única do apelido: ele aparece no balãozinho do sininho e
-- no assunto do e-mail, e duas cópias em camadas diferentes divergiriam.

create table if not exists public.notification_prefs (
  -- O nome de usuário do login, sem o domínio interno.
  username      text primary key,
  -- Como esta pessoa chama a outra ("mozi"). Nulo: usa o nome mesmo.
  nickname      text,
  -- Para onde avisar. Nulo: não manda e-mail para esta pessoa.
  email         text,
  email_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Apelido e e-mail de aviso de cada pessoa. Fora do código de propósito: o repositório é público.';

alter table public.notification_prefs enable row level security;
drop policy if exists notification_prefs_authenticated_all on public.notification_prefs;
create policy notification_prefs_authenticated_all on public.notification_prefs
  for all to authenticated using (true) with check (true);
