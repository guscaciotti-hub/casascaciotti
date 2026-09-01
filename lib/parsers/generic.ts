/**
 * Parser de fallback: casa linhas no formato `DD/MM DESCRIÇÃO R$ 1.234,56`
 * e as variações mais comuns. É o que roda quando nenhum parser específico
 * reconhece o emissor.
 */

import type { ParsedTransaction, ParseOptions, StatementParser } from './types'
import {
  buildIsoDate,
  isCreditDescription,
  isNoiseLine,
  parseAbbreviatedDate,
  parseBrlAmount,
  toLines,
  withInstallment,
} from './shared'

/** `DD/MM` ou `DD/MM/AA(AA)` no início da linha. */
const SLASH_DATE = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\s+/
/** `DD MMM` (`14 MAR`) no início da linha. */
const ABBR_DATE = /^(\d{1,2}\s*(?:DE\s+)?[A-Za-zçÇ]{3})\b\.?\s+/i

/** Valor monetário no fim da linha, com ou sem `R$` e com sinal em qualquer lado. */
const TRAILING_AMOUNT = /(-?\s*R?\$?\s*-?\d{1,3}(?:\.\d{3})*,\d{2}\s*-?)\s*$/

export function parseGeneric(text: string, options: ParseOptions): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []

  for (const line of toLines(text)) {
    if (isNoiseLine(line)) continue

    const parsed = parseLine(line, options)
    if (parsed) transactions.push(parsed)
  }

  return transactions
}

/** Tenta interpretar uma única linha como lançamento. Exportada para teste. */
export function parseLine(line: string, options: ParseOptions): ParsedTransaction | null {
  const amountMatch = line.match(TRAILING_AMOUNT)
  if (!amountMatch) return null

  const rawAmount = amountMatch[1].trim()
  const amount = parseBrlAmount(rawAmount)
  if (amount === null || amount === 0) return null

  const head = line.slice(0, amountMatch.index).trim()
  if (!head) return null

  let date: string | null = null
  let description = ''

  const slash = head.match(SLASH_DATE)
  if (slash) {
    date = buildIsoDate(
      Number(slash[1]),
      Number(slash[2]),
      options.referenceMonth,
      slash[3] ? Number(slash[3]) : undefined,
    )
    description = head.slice(slash[0].length).trim()
  } else {
    const abbr = head.match(ABBR_DATE)
    if (abbr) {
      const parts = parseAbbreviatedDate(abbr[1])
      if (parts) {
        date = buildIsoDate(parts.day, parts.month, options.referenceMonth)
        description = head.slice(abbr[0].length).trim()
      }
    }
  }

  if (!date || !description) return null

  // Descrição residual só com pontuação ou número não é lançamento.
  if (!/[A-Za-zÀ-ÿ]{2}/.test(description)) return null

  const signedAmount = isCreditDescription(description) ? -Math.abs(amount) : amount

  return withInstallment({ date, description, amount: signedAmount })
}

export const genericParser: StatementParser = {
  id: 'generic',
  label: 'Genérico',
  // O fallback aceita qualquer texto — o roteador só o usa por último.
  detect: () => true,
  parse: parseGeneric,
}

export default genericParser
