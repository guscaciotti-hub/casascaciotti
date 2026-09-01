/**
 * Motor de normalização de descrições de fatura.
 *
 * A descrição bruta que vem do PDF é ruidosa: prefixo do adquirente/gateway,
 * cidade e UF no fim, marcador de parcela no meio, acentuação inconsistente.
 * A categorização só é confiável se rodar sempre sobre a mesma forma canônica —
 * é isso que esta função produz.
 *
 * Esta é uma das duas peças em que bug silencioso vira dado errado.
 * Toda mudança aqui precisa vir com teste em `lib/__tests__/normalize.test.ts`.
 */

/** Prefixos de adquirente / gateway / subadquirente removidos do início. */
const GATEWAY_PREFIXES = [
  'PAGS',
  'PAG',
  'MERCPAGO',
  'MERCADOPAGO',
  'MERCADO PAGO',
  'MP',
  'PP',
  'PAYPAL',
  'IFD',
  'IFOOD',
  'EC',
  'EBW',
  'SUMUP',
  'STONE',
  'CIELO',
  'PICPAY',
  'REDE',
  'GETNET',
  'APPLE.COM/BILL',
  'APPLECOM/BILL',
  'DL',
  'DM',
  'TM',
]

/**
 * Padrões de parcela reconhecidos dentro da descrição.
 * Cobre `3/10`, `PARC 3/10`, `PARCELA 3 DE 10`, `(3 de 10)`, `3 DE 10`.
 */
const INSTALLMENT_PATTERNS: RegExp[] = [
  /\(?\s*PARC(?:ELA)?\.?\s*0*(\d{1,2})\s*(?:\/|\s+DE\s+)\s*0*(\d{1,2})\s*\)?/gi,
  /\(\s*0*(\d{1,2})\s*(?:\/|\s+DE\s+)\s*0*(\d{1,2})\s*\)/gi,
  /(?:^|\s)0*(\d{1,2})\s*\/\s*0*(\d{1,2})(?=\s|$)/g,
  /(?:^|\s)0*(\d{1,2})\s+DE\s+0*(\d{1,2})(?=\s|$)/gi,
]

/** UFs brasileiras — usadas para cortar o sufixo de cidade/estado. */
const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

/** Sufixos societários que não ajudam a identificar o estabelecimento. */
const COMPANY_SUFFIXES = /\s+(LTDA|ME|EPP|EIRELI|S\/A|SA|MEI|CIA)\.?(?=\s|$)/g

/**
 * Maior número de parcelas que tratamos como plausível.
 * Sem esse teto, "SEGURO 2/99" e códigos de loja viram parcela.
 */
const MAX_INSTALLMENTS = 48

export interface InstallmentInfo {
  current: number
  total: number
}

/** Remove acentuação mantendo o restante dos caracteres intactos. */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Extrai a informação de parcela da descrição, se houver.
 * Retorna `null` quando não encontra ou quando os números não fazem sentido
 * (parcela atual maior que o total, total menor que 2 ou acima do teto).
 */
export function extractInstallment(description: string): InstallmentInfo | null {
  const upper = stripAccents(description).toUpperCase()

  for (const pattern of INSTALLMENT_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(upper)
    if (!match) continue

    const current = Number(match[1])
    const total = Number(match[2])
    if (!Number.isFinite(current) || !Number.isFinite(total)) continue
    if (!isPlausibleInstallment(current, total)) continue

    return { current, total }
  }

  return null
}

/** `true` quando o par (atual, total) é uma parcela crível. */
function isPlausibleInstallment(current: number, total: number): boolean {
  if (!Number.isInteger(current) || !Number.isInteger(total)) return false
  return total >= 2 && total <= MAX_INSTALLMENTS && current >= 1 && current <= total
}

/**
 * Remove os marcadores de parcela do texto — mas só os plausíveis, para não
 * apagar números que fazem parte do nome do estabelecimento.
 */
function removeInstallmentMarkers(value: string): string {
  let out = value
  for (const pattern of INSTALLMENT_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, (match, current: string, total: string) =>
      isPlausibleInstallment(Number(current), Number(total)) ? ' ' : match,
    )
  }
  return out
}

/** Remove o prefixo de adquirente/gateway, se presente. Aplica em cascata. */
function removeGatewayPrefix(value: string): string {
  let out = value.trim()

  // Cascata: "PAG*MP*PADARIA" -> "PADARIA"
  for (let pass = 0; pass < 3; pass += 1) {
    const before = out
    for (const prefix of GATEWAY_PREFIXES) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // O separador (*, -, :, _) é obrigatório para não comer palavras que
      // apenas começam com as mesmas letras (ex.: "MPADARIA", "ECONOMIA").
      const re = new RegExp(`^${escaped}\\s*[*\\-:_]+\\s*`, 'i')
      if (re.test(out)) {
        out = out.replace(re, '').trim()
        break
      }
    }
    if (out === before) break
  }

  return out
}

/**
 * Remove sufixo de cidade/UF no fim da descrição.
 * Só corta quando as duas letras finais são uma UF real — evita destruir
 * descrições que terminam em sigla legítima (ex.: "SPOTIFY BR" continua).
 */
function removeCityStateSuffix(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)\s+([A-Z]{2})$/)
  if (!match) return trimmed

  const [, head, uf] = match
  if (!UFS.has(uf)) return trimmed
  // Não corta se sobrar quase nada — a UF pode ser o próprio nome.
  if (head.trim().length < 3) return trimmed

  return head.trim()
}

/**
 * Normaliza a descrição bruta do PDF para a forma usada na categorização.
 *
 * A ordem das etapas importa: a parcela sai antes da UF (senão "3/10 SP"
 * confunde o corte) e o prefixo de gateway sai antes do colapso de espaços.
 */
export function normalizeDescription(raw: string): string {
  if (!raw) return ''

  let out = stripAccents(raw).toUpperCase()

  // Ruído de encoding e caracteres de controle vindos do PDF.
  out = out.replace(/[\u0000-\u001f\u007f]/g, ' ')
  out = removeInstallmentMarkers(out)
  out = out.replace(/\s{2,}/g, ' ').trim()
  out = removeGatewayPrefix(out)
  out = out.replace(COMPANY_SUFFIXES, ' ')
  out = out.replace(/\s{2,}/g, ' ').trim()
  out = removeCityStateSuffix(out)

  // Limpa pontuação solta nas bordas, preservando o miolo.
  out = out.replace(/^[\s*\-.,;:/]+/, '').replace(/[\s*\-.,;:]+$/, '')

  return out.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Sugere o padrão a gravar em `merchant_rules` a partir de uma descrição
 * normalizada. Mantém o trecho estável do começo — onde mora o nome do
 * estabelecimento — descartando número de loja e códigos.
 */
export function suggestPattern(normalized: string): string {
  if (!normalized) return ''

  const tokens = normalized.split(' ').filter(Boolean)
  const stable: string[] = []

  for (const token of tokens) {
    // Para no primeiro token que parece código de loja / identificador.
    const isNumeric = /^\d+$/.test(token)
    const isCode = /\d/.test(token) && /[A-Z]/.test(token) && token.length >= 4
    if (isNumeric || isCode) break
    stable.push(token)
    if (stable.length === 3) break
  }

  const candidate = stable.join(' ').trim()
  // Um único token muito curto não é um padrão seguro — cai para o texto inteiro.
  if (candidate.length < 4) return normalized

  return candidate
}
