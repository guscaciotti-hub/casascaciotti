/**
 * Parser da fatura do Nubank.
 *
 * O PDF do Nubank sai do `pdf-parse` em dois formatos, dependendo da geração:
 *
 *   a) uma linha por lançamento — `14 MAR  Uber* Trip  R$ 24,90`
 *   b) três linhas — data, descrição e valor separados
 *
 * O parser trata os dois. Também descarta o bloco "Pagamento recebido" e o
 * resumo de limites, e reconhece `Parcela 3/10` no fim da descrição.
 */

import type { ParsedTransaction, ParseOptions, StatementParser } from './types'
import {
  buildIsoDate,
  canonicalLine,
  isCreditDescription,
  isNoiseLine,
  parseAbbreviatedDate,
  parseBrlAmount,
  toLines,
  withInstallment,
} from './shared'

const NUBANK_SIGNATURES = [
  'NUBANK',
  'NU PAGAMENTOS',
  'NU FINANCEIRA',
  'NUBANK.COM.BR',
  'ROXINHO',
]

/** `14 MAR` ou `14/03`, sozinho ou no início da linha. */
const DATE_HEAD = /^(\d{1,2}\s+[A-Za-zçÇ]{3}|\d{1,2}\/\d{1,2})\b\.?/
const AMOUNT_ONLY = /^-?\s*R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}\s*-?$/
const TRAILING_AMOUNT = /(-?\s*R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}\s*-?)\s*$/

/** Seções do PDF cujo conteúdo não é lançamento da fatura corrente. */
const SKIP_SECTION_START = /^(RESUMO|LIMITE|PROXIMAS FATURAS|PARCELAMENTOS? A VENCER)/
const SECTION_RESUME = /^(TRANSACOES|COMPRAS|LANCAMENTOS)/

export function detectNubank(text: string): boolean {
  const canonical = canonicalLine(text.slice(0, 4000))
  return NUBANK_SIGNATURES.some((signature) => canonical.includes(signature))
}

export function parseNubank(text: string, options: ParseOptions): ParsedTransaction[] {
  const lines = toLines(text)
  const transactions: ParsedTransaction[] = []

  let skipping = false
  let pendingDate: string | null = null
  let pendingDescription: string | null = null

  const flush = () => {
    pendingDate = null
    pendingDescription = null
  }

  for (const line of lines) {
    const canonical = canonicalLine(line)

    if (SECTION_RESUME.test(canonical)) {
      skipping = false
      flush()
      continue
    }
    if (SKIP_SECTION_START.test(canonical)) {
      skipping = true
      flush()
      continue
    }
    if (skipping || isNoiseLine(line)) continue

    // Formato (a): tudo numa linha só.
    const inline = parseInlineLine(line, options)
    if (inline) {
      transactions.push(inline)
      flush()
      continue
    }

    // Formato (b): data isolada.
    const dateMatch = line.match(DATE_HEAD)
    if (dateMatch && line.replace(DATE_HEAD, '').trim().length === 0) {
      pendingDate = toIso(dateMatch[1], options)
      pendingDescription = null
      continue
    }

    // Formato (b): valor isolado fecha o lançamento pendente.
    if (AMOUNT_ONLY.test(line)) {
      const amount = parseBrlAmount(line)
      if (pendingDate && pendingDescription && amount !== null && amount !== 0) {
        const signed = isCreditDescription(pendingDescription) ? -Math.abs(amount) : amount
        transactions.push(
          withInstallment({ date: pendingDate, description: pendingDescription, amount: signed }),
        )
      }
      flush()
      continue
    }

    // Formato (b): descrição entre a data e o valor.
    if (pendingDate && /[A-Za-zÀ-ÿ]{2}/.test(line)) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${line}` : line
    }
  }

  return transactions
}

function toIso(rawDate: string, options: ParseOptions): string | null {
  if (rawDate.includes('/')) {
    const [day, month] = rawDate.split('/').map(Number)
    return buildIsoDate(day, month, options.referenceMonth)
  }

  const parts = parseAbbreviatedDate(rawDate)
  if (!parts) return null
  return buildIsoDate(parts.day, parts.month, options.referenceMonth)
}

function parseInlineLine(line: string, options: ParseOptions): ParsedTransaction | null {
  const dateMatch = line.match(DATE_HEAD)
  if (!dateMatch) return null

  const amountMatch = line.match(TRAILING_AMOUNT)
  if (!amountMatch) return null

  const date = toIso(dateMatch[1], options)
  if (!date) return null

  const amount = parseBrlAmount(amountMatch[1])
  if (amount === null || amount === 0) return null

  const description = line
    .slice(dateMatch[0].length, amountMatch.index)
    .replace(/^[\s\-–—|]+/, '')
    .trim()

  if (!description || !/[A-Za-zÀ-ÿ]{2}/.test(description)) return null

  const signed = isCreditDescription(description) ? -Math.abs(amount) : amount
  return withInstallment({ date, description, amount: signed })
}

export const nubankParser: StatementParser = {
  id: 'nubank',
  label: 'Nubank',
  detect: detectNubank,
  parse: parseNubank,
}

export default nubankParser
