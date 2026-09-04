/**
 * Parser da fatura do Itaú.
 *
 * O layout tem duas armadilhas.
 *
 * A primeira: o valor vem colado na descrição, sem separador nenhum —
 *
 *   10/08MERCADOLIVRE*M 01/03193,33
 *   eletronicos  Bauru
 *
 * `01/03` é a parcela e `193,33` o valor, grudados. Ler o valor como "o
 * número no fim da linha" quebra aqui: em `01/033.193,33` a leitura ingênua
 * devolveria 33.193,33. Por isso a parcela é reconhecida junto com o valor,
 * numa única expressão, em vez de depois.
 *
 * A segunda: a fatura lista as parcelas que ainda vão vencer, em
 * "Compras parceladas - próximas faturas", no mesmo formato das compras do
 * mês. Somá-las inflaria o gasto — nesta fatura, R$ 366,18 a mais. O parser
 * ignora esse bloco inteiro.
 *
 * A linha seguinte a cada lançamento traz a categoria do próprio Itaú e a
 * cidade ("eletronicos  Bauru"). Não é usada: a categorização da casa vem das
 * regras do usuário, e a do banco muda sem aviso.
 */

import type { ParsedTransaction, ParseOptions, StatementParser } from './types'
import { buildIsoDate, canonicalLine, isCreditDescription, parseBrlAmount } from './shared'

const ITAU_SIGNATURES = ['ITAU', 'ITAUCARD', 'BANCO ITAU', 'ITAU UNIBANCO']

/** Início de lançamento: `DD/MM` grudado na descrição. */
const DATE_LINE = /^(\d{2})\/(\d{2})(.+)$/

/** Valor monetário no fim: `193,33`, `1.009,83`, `-1.266,50`. */
const AMOUNT = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`

/**
 * Descrição + parcela + valor, tudo grudado. A parcela precisa ser casada
 * aqui, e não depois, para o valor não roubar dígitos dela.
 */
const WITH_INSTALLMENT = new RegExp(`^(.*?)\\s*(\\d{2})/(\\d{2})(${AMOUNT})$`)

/** Descrição + valor, sem parcela. */
const WITHOUT_INSTALLMENT = new RegExp(`^(.*?)(${AMOUNT})$`)

/** Bloco de parcelas que ainda vão vencer: não é gasto deste mês. */
const FUTURE_SECTION = /COMPRAS\s+PARCELADAS|PROXIMAS\s+FATURAS|LANCAMENTOS\s+FUTUROS/

/** Cabeçalhos que voltam a valer como lançamento do mês. */
const REAL_SECTION = /^(LANCAMENTOS:?\s*(COMPRAS|PRODUTOS)|PAGAMENTOS\s+EFETUADOS)/

export function detectItau(text: string): boolean {
  const canonical = canonicalLine(text.slice(0, 6000))
  return ITAU_SIGNATURES.some((signature) => canonical.includes(signature))
}

export function parseItau(text: string, options: ParseOptions): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []
  let skipping = false

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const canonical = canonicalLine(line)
    if (REAL_SECTION.test(canonical)) {
      skipping = false
      continue
    }
    if (FUTURE_SECTION.test(canonical)) {
      skipping = true
      continue
    }
    if (skipping) continue

    const parsed = parseLine(line, options)
    if (parsed) transactions.push(parsed)
  }

  return transactions
}

/** Interpreta uma linha de lançamento. Exportada para teste. */
export function parseLine(line: string, options: ParseOptions): ParsedTransaction | null {
  const head = DATE_LINE.exec(line)
  if (!head) return null

  const date = buildIsoDate(Number(head[1]), Number(head[2]), options.referenceMonth)
  if (!date) return null

  const rest = head[3]

  // Parcela e valor saem juntos: separá-los depois é que gera erro de leitura.
  const installment = WITH_INSTALLMENT.exec(rest)
  if (installment) {
    const [, description, current, total, amount] = installment
    const value = parseBrlAmount(amount)
    if (value === null || value === 0) return null

    return {
      date,
      description: description.trim(),
      amount: signed(description, value),
      installmentCurrent: Number(current),
      installmentTotal: Number(total),
    }
  }

  const plain = WITHOUT_INSTALLMENT.exec(rest)
  if (!plain) return null

  const [, description, amount] = plain
  const value = parseBrlAmount(amount)
  if (value === null || value === 0) return null
  if (!/[A-Za-zÀ-ÿ]{2}/.test(description)) return null

  return { date, description: description.trim(), amount: signed(description, value) }
}

/** Estorno e pagamento nunca entram como despesa. */
function signed(description: string, amount: number): number {
  return isCreditDescription(description) ? -Math.abs(amount) : amount
}

export const itauParser: StatementParser = {
  id: 'itau',
  label: 'Itaú',
  detect: detectItau,
  parse: parseItau,
}

export default itauParser
