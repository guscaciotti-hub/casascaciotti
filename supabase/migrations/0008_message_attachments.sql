-- Anexos nos recados.
--
-- O pedido mais comum da casa é "me manda a fatura". Se o arquivo tem que
-- sair do sistema para o WhatsApp e voltar, o recurso não vale o clique — o
-- anexo precisa viver na conversa, ao lado do pedido que o gerou.
--
-- Um JSONB em vez de tabela filha: são poucos arquivos por mensagem, sempre
-- lidos junto com ela e nunca consultados por conta própria. Uma tabela aqui
-- custaria um join em toda leitura da conversa sem responder nenhuma pergunta
-- que a coluna não responda.
--
-- Cada item é { path, name, type, size }. `path` é a chave no bucket, não uma
-- URL: o bucket é privado e a URL assinada é gerada na hora da leitura, então
-- guardar link aqui daria link vencido.

alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.messages.attachments is
  'Anexos: [{ path, name, type, size }]. path é a chave no bucket "chat"; a URL é assinada na leitura.';

-- ---------------------------------------------------------------------------
-- Bucket dos anexos
-- ---------------------------------------------------------------------------
-- Privado, como o das faturas: fatura de cartão não é coisa para ficar em URL
-- pública adivinhável.
insert into storage.buckets (id, name, public)
values ('chat', 'chat', false)
on conflict (id) do nothing;

drop policy if exists "chat_authenticated_all" on storage.objects;
create policy "chat_authenticated_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'chat')
  with check (bucket_id = 'chat');
