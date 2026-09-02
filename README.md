# Casa Scaciotti

Sistema web privado de controle financeiro da casa. Duas pessoas, acesso total e
igual para as duas, sem hierarquia.

O recurso central é o pipeline de importação de fatura: sobe o PDF do cartão,
cada lançamento vira uma linha, e a mesma razão social cai sempre na mesma
categoria — sem retrabalho no mês seguinte.

## Como funciona a categorização

Esta é a peça que dá sentido ao resto. O caminho de um lançamento é sempre o
mesmo, na importação e no reprocessamento:

```
PDF → texto (server-side) → parser do banco → normalização → regras → categoria
```

1. **Extração** — `pdf-parse` roda no servidor (Route Handler). Nada de parse no
   browser.
2. **Parser** — cada banco tem layout próprio, então há parsers plugáveis com
   detecção de emissor (`lib/parsers/`): Nubank, Santander e Itaú. Sem emissor
   reconhecido, cai no genérico.
3. **Normalização** (`lib/normalize.ts`) — maiúsculas, sem acento, sem prefixo de
   adquirente (`PAG*`, `MP*`, `IFD*`…), sem sufixo de cidade/UF, sem marcador de
   parcela, sem sufixo societário. O resultado vai para `normalized_description`.
4. **Matcher** (`lib/matcher.ts`) — roda a descrição normalizada contra
   `merchant_rules` na ordem `exact` → `contains` (padrão mais longo primeiro,
   para "IFOOD CLUB" ganhar de "IFOOD") → `regex`. `priority` menor é avaliada
   antes. A primeira regra que casa define o estabelecimento e, por
   consequência, a categoria.
5. **Sem regra que case** — o lançamento fica sem estabelecimento, cai em "Não
   identificado" e entra na fila de revisão.

Na tela de revisão, ao rotular um lançamento o sistema oferece criar a regra
(marcado por padrão) e, ao confirmar, **reprocessa retroativamente** todos os
lançamentos históricos ainda não identificados que casem com ela. É esse passo
que faz o sistema ficar mais inteligente a cada mês.

A sugestão por IA é opcional e nunca aplica nada sozinha: ela só pré-preenche os
campos da revisão. Depois de confirmada, a regra é determinística e a IA não é
mais chamada para aquele estabelecimento.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + componentes no padrão shadcn/ui (Radix)
- Supabase — Postgres, Auth e Storage
- Recharts
- Vitest
- Deploy na Vercel

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave pública do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | não | Só para scripts administrativos. Nunca vai ao client |
| `ANTHROPIC_API_KEY` | não | Habilita o botão "Sugerir categorias com IA" |

`.env` e `.env.local` estão no `.gitignore` e nunca devem ser commitados.

### Banco de dados

As migrations estão em `supabase/migrations/`, em ordem:

| Arquivo | O que faz |
| --- | --- |
| `0001_init.sql` | Tabelas, índices, RLS e o bucket `statements` no Storage |
| `0002_seed.sql` | Categorias iniciais (idempotente) |
| `0003_transaction_months.sql` | View `transactions_monthly`, que resolve o mês de cada lançamento |
| `0004_bill_interest.sql` | Juros pagos numa conta fixa |
| `0005_transaction_payments.sql` | `is_payment`, que separa pagamento de fatura de gasto |

Com a [CLI do Supabase](https://supabase.com/docs/guides/local-development):

```bash
supabase link --project-ref <ref>
supabase db push
```

Ou cole o conteúdo de cada arquivo, em ordem, no SQL Editor do painel.

O RLS libera leitura e escrita para qualquer usuário autenticado — é um sistema
de duas pessoas com acesso igual, por decisão de projeto.

### Usuários

O login é por **nome de usuário**, não por e-mail. O Supabase Auth identifica
conta por e-mail, então `lib/auth.ts` faz a ponte: o que a pessoa digita vira
`<usuario>@casascaciotti.local` antes de ir para o Supabase. `.local` é um TLD
reservado que nunca resolve na internet — nenhum e-mail é enviado para lá, o
endereço existe só como identificador interno.

Para criar um usuário, em **Authentication → Users → Add user** no painel do
Supabase: e-mail `<usuario>@casascaciotti.local`, senha à escolha, e marque
**Auto Confirm User**. Não há cadastro pela interface: é um sistema fechado.

Para trocar uma senha: **Authentication → Users → o usuário → Reset password**.

## Como o dinheiro é contado

- **Valor positivo é despesa; negativo é crédito.** Os totais somam com sinal,
  então um estorno de loja abate o gasto do mês em vez de virar receita — se a
  loja devolveu o dinheiro, a casa de fato gastou menos.
- **Pagamento da própria fatura não é gasto.** A fatura lista, junto com as
  compras, os pagamentos da fatura anterior. Somá-los zeraria o mês: uma fatura
  de R$ 13.500 com R$ 12.900 em pagamentos apareceria como R$ 600 de gasto.
  `transactions.is_payment` marca esses lançamentos; eles ficam no histórico
  mas fora do gasto do mês, da divisão por categoria e da fila de revisão.
  `isInvoicePayment` (em `lib/parsers/shared.ts`) é mais estrito que
  `isCreditDescription` justamente para não confundir os dois.
- **O mês de um lançamento de fatura é o mês da fatura**, não a data da compra —
  uma fatura de março traz compras de fevereiro, mas o dinheiro sai em março.
  Lançamentos manuais usam a data deles. É o que a view `transactions_monthly`
  resolve.

  Por isso o dashboard diz **"A pagar em março"**, e não "gasto de março": o
  número é o dinheiro que sai naquele mês, não o consumo daquele mês. Os dois
  são diferentes e confundi-los é fácil, então o card mostra também até quando
  vão as compras e quando a fatura vence.
- **`dedupe_hash`** é o SHA256 de origem + data + descrição bruta + valor, com
  constraint `UNIQUE`. A importação faz `upsert` ignorando conflitos e informa
  quantos foram pulados, então reimportar a mesma fatura é seguro.

## Testes

```bash
npm test
```

Cobrem as peças em que bug silencioso vira dado errado:

- `lib/__tests__/normalize.test.ts` — motor de normalização
- `lib/__tests__/matcher.test.ts` — matcher de regras e sua precedência
- `lib/__tests__/parsers.test.ts` — parsers de fatura
- `lib/__tests__/santander.test.ts` — o layout do Santander, que é o mais atípico
- `lib/__tests__/pipeline.test.ts` — ponta a ponta sobre um PDF de verdade

Mexeu em normalização ou no matcher? Traga o teste junto.

## Adicionando um parser de banco

Os parsers vivem em `lib/parsers/`. Cada um exporta um `StatementParser`:

```ts
{
  id: string                            // vira o `statements.source` padrão
  label: string                         // nome na interface
  detect: (text: string) => boolean     // assinatura do emissor no texto
  parse: (text, options) => ParsedTransaction[]
}
```

Para adicionar o Inter, por exemplo:

1. **Pegue o texto extraído.** Rode o PDF pelo `pdf-parse` e olhe o resultado —
   o formato das linhas é o que o parser precisa casar.

   ```bash
   node -e "require('pdf-parse/lib/pdf-parse.js')(require('fs').readFileSync('fatura.pdf')).then(r=>console.log(r.text))"
   ```

2. **Crie `lib/parsers/inter.ts`.** Reaproveite os utilitários de
   `lib/parsers/shared.ts` — `parseBrlAmount`, `buildIsoDate`, `isNoiseLine`,
   `isCreditDescription`, `withInstallment`, `toLines`. Eles já tratam formato
   brasileiro de valor, inferência de ano, ruído de cabeçalho/rodapé e estornos.

   ```ts
   export const interParser: StatementParser = {
     id: 'inter',
     label: 'Inter',
     detect: (text) => canonicalLine(text.slice(0, 4000)).includes('BANCO INTER'),
     parse: (text, options) => {
       /* … */
     },
   }
   ```

3. **Registre em `lib/parsers/index.ts`**, no array `PARSERS` (o genérico fica
   fora — ele é o fallback). Se o banco ainda não estiver em `SOURCE_OPTIONS`,
   adicione lá também: o `id` precisa bater para que a escolha do usuário na
   tela de upload force o parser certo.

4. **Escreva o teste** em `lib/__tests__/parsers.test.ts` com trechos reais do
   texto extraído. Cubra pelo menos: uma linha normal, uma parcelada, um
   estorno e uma linha de ruído que deve ser ignorada.

Coisas a acertar em qualquer parser:

- Valores negativos, estornos e pagamentos da fatura **não** entram como
  despesa — devolva `amount` negativo.
- Parcelas aparecem como `3/10`, `PARC 3/10`, `(3 de 10)` — capture os dois
  números (`withInstallment` faz isso a partir da descrição).
- Ignore cabeçalho, rodapé, total da fatura, limite disponível e blocos de
  parcelas futuras.
- Devolva `[]` quando não reconhecer nada: o roteador cai no genérico sozinho.

## Estrutura

```
app/
  (app)/            telas autenticadas: dashboard, faturas, contas, reserva…
  actions/          Server Actions (categorias, estabelecimentos, lançamentos…)
  api/
    statements/import   pipeline de importação de PDF
    ai/suggest          sugestão opcional por IA
  login/            autenticação
components/         UI (padrão shadcn/ui) e componentes de tela
lib/
  parsers/          parsers de fatura, plugáveis por banco
  normalize.ts      motor de normalização de descrição
  matcher.ts        matcher de merchant_rules
  categorization.ts amarra normalização + matcher ao banco
  import-statement.ts  pipeline completo de importação
  queries.ts        leituras e agregações das telas
supabase/migrations/  schema, RLS, seed e views
```

## Deploy

Na Vercel: importe o repositório, defina as variáveis de ambiente da tabela
acima e faça o deploy. As migrations são aplicadas no Supabase, não pela Vercel.
