import { createHash } from 'node:crypto'

/**
 * Identidade de um lançamento para efeito de deduplicação.
 * SHA256 de origem + data + descrição bruta + valor, de modo que reimportar
 * a mesma fatura (ou faturas com sobreposição de período) não duplique nada.
 */
export function dedupeHash(input: {
  source: string
  transactionDate: string
  rawDescription: string
  amount: number
}): string {
  const payload = [
    input.source.trim().toLowerCase(),
    input.transactionDate,
    input.rawDescription.replace(/\s+/g, ' ').trim().toUpperCase(),
    input.amount.toFixed(2),
  ].join('|')

  return createHash('sha256').update(payload, 'utf8').digest('hex')
}
