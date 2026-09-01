/**
 * Leitura das variáveis de ambiente do Supabase.
 *
 * As duas são coladas à mão no painel da Vercel, e é ali que nasce a maior
 * parte dos problemas de conexão. O copiar/colar arrasta com frequência:
 *
 *   - caractere invisível (aspa curva, espaço não separável, BOM)
 *   - quebra de linha no meio, quando o valor aparece embrulhado na tela
 *   - aspas em volta, copiadas de um exemplo
 *   - o nome da variável junto, no formato `NOME=valor`
 *
 * Cada um desses quebra de um jeito diferente e nenhum é visível olhando o
 * campo no painel. Um caractere não-ASCII derruba o `fetch` antes de sair do
 * navegador ("String contains non ISO-8859-1 code point"); os outros chegam ao
 * Supabase e voltam como "Invalid API key". Sanear na leitura resolve os
 * quatro de uma vez.
 *
 * URL e chave do Supabase são ASCII e não contêm espaço — nem a chave legada
 * em JWT (base64url separado por pontos) nem a moderna (`sb_publishable_...`).
 * Então nada do que é descartado aqui é conteúdo legítimo.
 */

/** Nomes que podem aparecer grudados no valor quando se cola a linha inteira. */
const ENV_NAME_PREFIX = /^(NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)|SUPABASE_(URL|ANON_KEY))\s*[=:]\s*/i

/**
 * Devolve o valor pronto para uso: sem espaço, sem caractere invisível, sem
 * aspas em volta e sem o nome da variável na frente.
 */
export function sanitize(value: string | undefined): string {
  if (!value) return ''

  let out = value
    // Tudo que não é ASCII imprimível é ruído — inclusive espaço e quebra de
    // linha, que nenhum dos dois valores contém.
    .replace(/[^\x21-\x7e]/g, '')
    .trim()

  out = out.replace(ENV_NAME_PREFIX, '')

  // Aspas em volta, de um exemplo copiado junto.
  const quoted = out.match(/^(["'`])(.*)\1$/)
  if (quoted) out = quoted[2]

  return out.trim()
}

function required(name: string, value: string): string {
  if (!value) {
    throw new Error(
      `A variável de ambiente ${name} não está definida. ` +
        'Configure-a no painel da Vercel (Settings → Environment Variables) e refaça o deploy.',
    )
  }
  return value
}

export function supabaseUrl(): string {
  // A referência a process.env precisa ser literal: o Next substitui o texto
  // `process.env.NEXT_PUBLIC_...` no build. Acesso dinâmico não é substituído.
  return required('NEXT_PUBLIC_SUPABASE_URL', sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL))
}

export function supabaseAnonKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}

/**
 * Descrição da chave em uso, sem revelá-la: formato, tamanho e as pontas.
 * É o suficiente para diagnosticar um "Invalid API key" — comparar o que
 * chegou no navegador com o que o painel do Supabase mostra — sem expor a
 * chave inteira em tela ou em log.
 */
export function describeAnonKey(): string {
  const key = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (!key) return 'não definida'

  const format = key.startsWith('sb_publishable_')
    ? 'publishable'
    : key.split('.').length === 3
      ? 'JWT'
      : 'formato desconhecido'

  return `${format}, ${key.length} caracteres, ${key.slice(0, 6)}…${key.slice(-4)}`
}
