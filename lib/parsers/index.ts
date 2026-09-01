/**
 * Roteador de parsers de fatura.
 *
 * Detecta o emissor pelo texto extraído do PDF e delega ao parser específico.
 * Se nenhum reconhecer — ou se o específico não achar nada —, cai no genérico.
 */

import type { ParseOptions, ParseResult, StatementParser } from './types'
import { canonicalLine, parseBrlAmount, buildIsoDate } from './shared'
import { nubankParser } from './nubank'
import { itauParser } from './itau'
import { santanderParser } from './santander'
import { genericParser } from './generic'

/** Parsers específicos, na ordem de tentativa. O genérico fica fora da lista. */
export const PARSERS: StatementParser[] = [nubankParser, santanderParser, itauParser]

/** Opções de origem oferecidas na tela de upload. */
export const SOURCE_OPTIONS = [
  { id: 'nubank', label: 'Nubank' },
  { id: 'itau', label: 'Itaú' },
  { id: 'inter', label: 'Inter' },
  { id: 'bradesco', label: 'Bradesco' },
  { id: 'santander', label: 'Santander' },
  { id: 'c6', label: 'C6 Bank' },
  { id: 'outro', label: 'Outro' },
]

/** Escolhe o parser pelo texto. `preferredId` força um emissor específico. */
export function selectParser(text: string, preferredId?: string): StatementParser {
  if (preferredId) {
    const preferred = PARSERS.find((parser) => parser.id === preferredId)
    if (preferred) return preferred
  }

  const detected = PARSERS.find((parser) => parser.detect(text))
  return detected ?? genericParser
}

/**
 * Extrai os lançamentos do texto da fatura.
 * Quando o parser específico não devolve nada, tenta o genérico antes de
 * desistir — melhor um resultado parcial revisável do que import vazio.
 */
export function parseStatement(
  text: string,
  options: ParseOptions & { preferredParserId?: string },
): ParseResult {
  const parser = selectParser(text, options.preferredParserId)
  let transactions = parser.parse(text, options)
  let used = parser

  if (transactions.length === 0 && parser.id !== genericParser.id) {
    transactions = genericParser.parse(text, options)
    used = genericParser
  }

  return {
    parserId: used.id,
    parserLabel: used.label,
    transactions,
    totalAmount: extractTotalAmount(text),
    dueDate: extractDueDate(text, options.referenceMonth),
  }
}

/** Lê o total da fatura, quando o documento o imprime de forma reconhecível. */
export function extractTotalAmount(text: string): number | null {
  const canonical = canonicalLine(text)
  const patterns = [
    /TOTAL\s+(?:DA\s+|DESTA\s+)?FATURA[^\d\-]{0,40}(-?\s*R?\$?\s*[\d.]+,\d{2})/,
    /VALOR\s+TOTAL[^\d\-]{0,40}(-?\s*R?\$?\s*[\d.]+,\d{2})/,
    /TOTAL\s+A\s+PAGAR[^\d\-]{0,40}(-?\s*R?\$?\s*[\d.]+,\d{2})/,
  ]

  for (const pattern of patterns) {
    const match = canonical.match(pattern)
    if (match) {
      const value = parseBrlAmount(match[1])
      if (value !== null) return value
    }
  }

  return null
}

/** Lê a data de vencimento da fatura, quando presente. */
export function extractDueDate(text: string, referenceMonth: string): string | null {
  const canonical = canonicalLine(text)
  const match = canonical.match(
    /(?:DATA\s+DE\s+)?VENCIMENTO[^\d]{0,30}(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/,
  )
  if (!match) return null

  return buildIsoDate(
    Number(match[1]),
    Number(match[2]),
    referenceMonth,
    match[3] ? Number(match[3]) : undefined,
  )
}

export { genericParser, nubankParser, itauParser, santanderParser }
export type { ParsedTransaction, ParseOptions, ParseResult, StatementParser } from './types'
