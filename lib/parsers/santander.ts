/**
 * Parser da fatura do Santander (Empresas / Mastercard).
 *
 * O layout não se parece com o dos outros bancos. No texto extraído, cada
 * lançamento ocupa várias linhas e a data vem colada na descrição:
 *
 *   02-01-2026GRUPO CASAS BAHIA 1018PARC 08/10 SAO VICENTE\
 *
 *   399,90
 *
 * Ou seja: `DD-MM-AAAA`, descrição, marcador de parcela, cidade, uma barra
 * invertida encerrando o bloco — e o valor só aparece uma ou duas linhas
 * depois. Descrições longas ainda quebram no meio:
 *
 *   07-08-2026KEETABR*BC PIZZAS LTDASao
 *   Vicente\KEETABR*BC
 *
 * Compras internacionais trazem três números em sequência — US$, R$ e a
 * cotação do dólar —, e o que interessa é o do meio:
 *
 *   04-08-2026ANTHROPIC* CLAUDE SUBSAN FRANCISCO\550,00BRL
 *   108,00     <- US$
 *   580,64     <- R$   (é este)
 *   5,37       <- cotação
 *
 * Pagamentos da fatura vêm com sinal negativo e nunca contam como despesa.
 *
 * A cidade fica grudada no nome do estabelecimento sem separador
 * ("EBN *HOSTINGERCURITIBA"), e não há como separar com segurança. Não tem
 * problema: o que a categorização exige é que a mesma razão social produza
 * sempre o mesmo texto, e produz. Uma regra `contains` com "HOSTINGER"
 * resolve o estabelecimento para sempre.
 */

import type { ParsedTransaction, ParseOptions, StatementParser } from './types'
import { buildIsoDate, canonicalLine, isCreditDescription, parseBrlAmount, withInstallment } from './shared'

const SANTANDER_SIGNATURES = ['SANTANDER', 'BANCO SANTANDER']

/** Início de lançamento: `DD-MM-AAAA` grudado na descrição. */
const DATE_LINE = /^(\d{2})-(\d{2})-(\d{4})(.*)$/

/** Linha que contém só um valor monetário. */
const AMOUNT_ONLY = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/

/** Cauda de compra internacional: `\550,00BRL` no fim da linha da descrição. */
const INTERNATIONAL_TAIL = /\\\s*[\d.,]+\s*[A-Z]{3}\s*$/

/** Quantas linhas depois da descrição procurar o valor. */
const LOOKAHEAD = 8

export function detectSantander(text: string): boolean {
  const canonical = canonicalLine(text.slice(0, 6000))
  return SANTANDER_SIGNATURES.some((signature) => canonical.includes(signature))
}

export function parseSantander(text: string, options: ParseOptions): ParsedTransaction[] {
  // Preserva as linhas vazias: elas separam a descrição do valor.
  const lines = text.split(/\r?\n/).map((line) => line.trim())
  const transactions: ParsedTransaction[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = DATE_LINE.exec(lines[index])
    if (!match) continue

    const date = buildIsoDate(Number(match[1]), Number(match[2]), options.referenceMonth, Number(match[3]))
    if (!date) continue

    const block = readBlock(lines, index, match[4])
    if (!block) continue

    const { description, amount } = block
    if (!description || amount === null || amount === 0) continue

    const signed = isCreditDescription(description) ? -Math.abs(amount) : amount
    transactions.push(withInstallment({ date, description, amount: signed }))
  }

  return transactions
}

interface Block {
  description: string
  amount: number | null
}

/**
 * Lê um lançamento a partir da linha da data: junta a descrição (que pode
 * quebrar em várias linhas) e acha o valor logo abaixo.
 */
function readBlock(lines: string[], start: number, firstLine: string): Block | null {
  const isInternational = INTERNATIONAL_TAIL.test(firstLine)

  const parts: string[] = []
  const amounts: number[] = []
  let descriptionClosed = false

  appendPart(parts, firstLine)
  if (firstLine.includes('\\')) descriptionClosed = true

  for (let offset = 1; offset <= LOOKAHEAD; offset += 1) {
    const line = lines[start + offset]
    if (line === undefined) break
    // Outro lançamento começou: este não tinha valor.
    if (DATE_LINE.test(line)) break

    if (AMOUNT_ONLY.test(line)) {
      descriptionClosed = true
      const value = parseBrlAmount(line)
      if (value !== null) amounts.push(value)

      // Nacional usa o primeiro valor; internacional, o segundo (o em reais).
      if (amounts.length >= (isInternational ? 2 : 1)) break
      continue
    }

    if (!descriptionClosed && line) {
      appendPart(parts, line)
      if (line.includes('\\')) descriptionClosed = true
    }
  }

  const amount = isInternational ? (amounts[1] ?? null) : (amounts[0] ?? null)

  return { description: parts.join(' ').replace(/\s{2,}/g, ' ').trim(), amount }
}

/** Adiciona um pedaço da descrição, cortando na barra que encerra o bloco. */
function appendPart(parts: string[], line: string): void {
  const cut = line.indexOf('\\')
  const piece = (cut === -1 ? line : line.slice(0, cut)).trim()
  if (piece) parts.push(piece)
}

export const santanderParser: StatementParser = {
  id: 'santander',
  label: 'Santander',
  detect: detectSantander,
  parse: parseSantander,
}

export default santanderParser
