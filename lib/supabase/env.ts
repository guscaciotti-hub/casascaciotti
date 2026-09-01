/**
 * Leitura das variáveis de ambiente do Supabase.
 *
 * A chave anônima viaja em cabeçalho HTTP (`apikey`, `Authorization`), e
 * cabeçalho só aceita ASCII. Um copiar/colar no painel da Vercel arrasta com
 * frequência caractere invisível — aspa curva, espaço não separável, quebra de
 * linha — e o navegador então falha com:
 *
 *   Failed to read the 'headers' property from 'RequestInit':
 *   String contains non ISO-8859-1 code point.
 *
 * O erro aparece só no clique de "Entrar", longe da causa. Sanear na leitura
 * custa nada e evita uma hora de caça ao fantasma.
 *
 * URL e chave do Supabase são ASCII por definição (base64url e URL), então
 * descartar o que não é ASCII imprimível nunca remove conteúdo legítimo.
 */

/** Remove espaços das bordas e qualquer caractere fora do ASCII imprimível. */
export function sanitize(value: string | undefined): string {
  if (!value) return ''
  return value.trim().replace(/[^\x20-\x7e]/g, '')
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
