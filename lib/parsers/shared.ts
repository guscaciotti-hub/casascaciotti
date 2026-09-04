/** Utilidades compartilhadas pelos parsers de fatura. */

import { stripAccents, extractInstallment } from '@/lib/normalize'

/** Abreviações de mês em português usadas pelos bancos. */
const MONTH_ABBR: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
}

/**
 * Linhas que nunca são lançamento: cabeçalho, rodapé, totalizador, limite.
 * Testadas contra a versão sem acento e em maiúsculas.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^\s*$/,
  /TOTAL\s+(DA\s+)?FATURA/,
  /^\s*TOTAL\b/,
  /VALOR\s+TOTAL/,
  /LIMITE\s+(DISPONIVEL|TOTAL|DE\s+CREDITO)/,
  /SALDO\s+(ANTERIOR|EM\s+ABERTO|DEVEDOR)/,
  /PAGAMENTO\s+MINIMO/,
  /VENCIMENTO\s+DA\s+FATURA/,
  /DATA\s+DE\s+VENCIMENTO/,
  /^\s*VENCIMENTO\b/,
  /RESUMO\s+DA\s+FATURA/,
  /DEMONSTRATIVO/,
  /^\s*PAGINA\s+\d+/,
  /\bPAG\.\s*\d+\s*(DE|\/)\s*\d+/,
  /^\s*CPF\b/,
  /^\s*CNPJ\b/,
  /OUVIDORIA/,
  /SAC\s*:/,
  /WWW\./,
  /HTTPS?:/,
  /ENCARGOS\s+(DO|DE)/,
  /JUROS\s+(DE|ROTATIVO)/,
  /IOF\b/,
  /MULTA\s+DE\s+ATRASO/,
  /TAXAS?\s+E\s+ENCARGOS/,
  /PROXIMAS?\s+FATURAS/,
  /COMPRAS\s+PARCELADAS\s+A\s+VENCER/,
  /^\s*DATA\s+(DESCRICAO|LANCAMENTO|HISTORICO)/,
  /^\s*(DESCRICAO|LANCAMENTOS?|HISTORICO)\s*$/,
  /^\s*(VALOR|VALOR\s+EM\s+R\$)\s*$/,
  /LINHA\s+DIGITAVEL/,
  /CODIGO\s+DE\s+BARRAS/,
  /CENTRAL\s+DE\s+ATENDIMENTO/,
]

/** Marcadores de estorno / crédito / pagamento — nunca contam como despesa. */
const CREDIT_MARKERS: RegExp[] = [
  /\bESTORNO\b/,
  /\bESTORNADO\b/,
  /\bDEVOLUCAO\b/,
  /\bREEMBOLSO\b/,
  /\bCASHBACK\b/,
  /\bCREDITO\s+DE\b/,
  /\bPAGAMENTO\s+(RECEBIDO|EFETUADO|FATURA|DEB|EM\s+)/,
  /\bPAGTO\b/,
  /\bDESCONTO\s+ANTECIPACAO\b/,
  /\bAJUSTE\s+A\s+CREDITO\b/,
  /\bSALDO\s+ANTERIOR\b/,
]

/** Normaliza a linha para os testes de ruído: sem acento, maiúscula. */
export function canonicalLine(line: string): string {
  return stripAccents(line).toUpperCase()
}

/** `true` quando a linha é cabeçalho, rodapé ou totalizador. */
export function isNoiseLine(line: string): boolean {
  const canonical = canonicalLine(line)
  return NOISE_PATTERNS.some((pattern) => pattern.test(canonical))
}

/** `true` quando a descrição indica crédito/estorno em vez de despesa. */
export function isCreditDescription(description: string): boolean {
  const canonical = canonicalLine(description)
  return CREDIT_MARKERS.some((pattern) => pattern.test(canonical))
}

/**
 * Marcadores de pagamento da própria fatura — mais estritos que os de crédito.
 * Um estorno de loja também é crédito, mas abate o gasto do mês; pagar o
 * cartão não, porque é transferência.
 */
const INVOICE_PAYMENT_MARKERS: RegExp[] = [
  /\bPAGAMENTO\s+DE\s+FATURA\b/,
  /\bPAGAMENTO\s+FATURA\b/,
  /\bPAGAMENTO\s+RECEBIDO\b/,
  /\bPAGAMENTO\s+EFETUADO\b/,
  /\bPAGTO\s+(DE\s+)?FATURA\b/,
  /\bPAGAMENTO\s+EM\s+\w+\b/,
  // Itaú: "PAGAMENTO DEB AUTOMATIC" (débito automático da fatura).
  /\bPAGAMENTO\s+DEB/,
  /\bSALDO\s+ANTERIOR\b/,
]

/**
 * `true` quando o lançamento é pagamento da própria fatura.
 *
 * Esses ficam fora do gasto do mês: somá-los zeraria o total, já que uma
 * fatura de R$ 13.500 costuma vir acompanhada de quase o mesmo em pagamentos
 * da fatura anterior.
 */
export function isInvoicePayment(description: string): boolean {
  const canonical = canonicalLine(description)
  return INVOICE_PAYMENT_MARKERS.some((pattern) => pattern.test(canonical))
}

/**
 * Converte um valor em formato brasileiro para número.
 * Aceita `1.234,56`, `R$ 1.234,56`, `-R$ 1.234,56`, `1.234,56-` e `1234.56`.
 * Devolve `null` quando não é um valor monetário.
 */
export function parseBrlAmount(raw: string): number | null {
  if (!raw) return null

  const text = raw.trim()
  const negative = /^-/.test(text) || /-\s*$/.test(text) || /^\(.*\)$/.test(text)

  const digits = text.replace(/[^\d,.]/g, '')
  if (!digits) return null

  let normalized: string
  if (digits.includes(',')) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal.
    normalized = digits.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = digits
  }

  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value)) return null

  return negative ? -Math.abs(value) : value
}

/**
 * Resolve o ano de um lançamento `DD/MM` a partir do mês de referência da
 * fatura. Uma fatura de janeiro carrega compras de dezembro do ano anterior.
 */
export function resolveYear(month: number, referenceMonth: string): number {
  const [refYear, refMonth] = referenceMonth.split('-').map(Number)
  const diff = month - refMonth

  if (diff > 6) return refYear - 1
  if (diff < -6) return refYear + 1
  return refYear
}

/** Monta a data ISO a partir de dia/mês (e ano opcional) e do mês de referência. */
export function buildIsoDate(
  day: number,
  month: number,
  referenceMonth: string,
  explicitYear?: number,
): string | null {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null
  if (day < 1 || day > 31 || month < 1 || month > 12) return null

  let year = explicitYear ?? resolveYear(month, referenceMonth)
  if (explicitYear !== undefined && explicitYear < 100) year = 2000 + explicitYear

  // Rejeita datas impossíveis (31/02 etc.).
  const probe = new Date(year, month - 1, day)
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Converte `12 MAR` / `12 mar` em `{ day, month }`. */
export function parseAbbreviatedDate(raw: string): { day: number; month: number } | null {
  const match = canonicalLine(raw).match(/^(\d{1,2})\s*(?:DE\s+)?([A-Z]{3})/)
  if (!match) return null

  const month = MONTH_ABBR[match[2]]
  if (!month) return null

  return { day: Number(match[1]), month }
}

/** Aplica a informação de parcela extraída da descrição a um lançamento. */
export function withInstallment<T extends { description: string }>(
  transaction: T,
): T & { installmentCurrent?: number; installmentTotal?: number } {
  const installment = extractInstallment(transaction.description)
  if (!installment) return transaction

  return {
    ...transaction,
    installmentCurrent: installment.current,
    installmentTotal: installment.total,
  }
}

/** Quebra o texto do PDF em linhas úteis, já sem espaços redundantes. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
}
