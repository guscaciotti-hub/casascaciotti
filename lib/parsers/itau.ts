/**
 * Parser da fatura do Itaú.
 *
 * Ponto de partida: detecta o emissor e reaproveita a extração linha a linha
 * do parser genérico, descartando os blocos de resumo próprios do Itaú
 * ("Lançamentos: compras parceladas — próximas faturas") que duplicariam
 * parcelas ainda não cobradas.
 *
 * Refine aqui quando tiver um PDF real em mãos — ver README, seção
 * "Adicionando um parser de banco".
 */

import type { ParsedTransaction, ParseOptions, StatementParser } from './types'
import { parseGeneric } from './generic'
import { canonicalLine } from './shared'

const ITAU_SIGNATURES = ['ITAU', 'ITAUCARD', 'BANCO ITAU', 'ITAU UNIBANCO']

/** Blocos que listam parcelas futuras — não são despesa do mês. */
const FUTURE_SECTION = /(PROXIMAS FATURAS|COMPRAS PARCELADAS A VENCER|LANCAMENTOS FUTUROS)/

export function detectItau(text: string): boolean {
  const canonical = canonicalLine(text.slice(0, 4000))
  return ITAU_SIGNATURES.some((signature) => canonical.includes(signature))
}

export function parseItau(text: string, options: ParseOptions): ParsedTransaction[] {
  const lines = text.split(/\r?\n/)
  const kept: string[] = []
  let skipping = false

  for (const line of lines) {
    const canonical = canonicalLine(line)

    if (FUTURE_SECTION.test(canonical)) {
      skipping = true
      continue
    }
    // Um cabeçalho de seção conhecido volta a ligar a captura.
    if (skipping && /^(LANCAMENTOS|COMPRAS|TRANSACOES|DATA\s)/.test(canonical.trim())) {
      skipping = false
    }
    if (skipping) continue

    kept.push(line)
  }

  return parseGeneric(kept.join('\n'), options)
}

export const itauParser: StatementParser = {
  id: 'itau',
  label: 'Itaú',
  detect: detectItau,
  parse: parseItau,
}

export default itauParser
