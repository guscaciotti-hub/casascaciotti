/** Formatação pt-BR: dinheiro em `R$ 1.234,56`, datas em `DD/MM/AAAA`. */

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function formatCurrency(value: number | null | undefined): string {
  return currencyFormatter.format(Number(value ?? 0))
}

export function formatCurrencyCompact(value: number | null | undefined): string {
  return compactCurrencyFormatter.format(Number(value ?? 0))
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—'
  return percentFormatter.format(fraction)
}

/**
 * Formata uma data ISO (`YYYY-MM-DD` ou timestamp) como `DD/MM/AAAA`.
 * Datas puras são tratadas como locais para não escorregar um dia por fuso.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? parseIsoDate(value) : value
  if (!date || Number.isNaN(date.getTime())) return '—'

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

/** Converte `YYYY-MM-DD` em Date local (sem deslocamento de fuso). */
export function parseIsoDate(value: string): Date {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  return new Date(value)
}

/** `2026-03-01` -> `Março de 2026`. */
export function formatMonthLabel(referenceMonth: string): string {
  const date = parseIsoDate(referenceMonth)
  if (Number.isNaN(date.getTime())) return referenceMonth
  const name = MONTHS_PT[date.getMonth()]
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${date.getFullYear()}`
}

/** `2026-03-01` -> `março`. Para frases no meio do texto. */
export function formatMonthName(referenceMonth: string): string {
  const date = parseIsoDate(referenceMonth)
  if (Number.isNaN(date.getTime())) return referenceMonth
  return MONTHS_PT[date.getMonth()]
}

/** `2026-03-01` -> `mar/26`. Para eixos de gráfico. */
export function formatMonthShort(referenceMonth: string): string {
  const date = parseIsoDate(referenceMonth)
  if (Number.isNaN(date.getTime())) return referenceMonth
  const name = MONTHS_PT[date.getMonth()].slice(0, 3)
  return `${name}/${String(date.getFullYear()).slice(2)}`
}

/** Primeiro dia do mês, em ISO. Aceita Date ou string. */
export function toReferenceMonth(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? parseIsoDate(value) : value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

/** Soma (ou subtrai) meses a um `reference_month`. */
export function addMonths(referenceMonth: string, delta: number): string {
  const date = parseIsoDate(referenceMonth)
  date.setDate(1)
  date.setMonth(date.getMonth() + delta)
  return toReferenceMonth(date)
}

/** Lista de `reference_month` terminando no mês informado (inclusive). */
export function lastMonths(referenceMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addMonths(referenceMonth, index - (count - 1)))
}

/** `2026-08-24` -> `24/08`. Data curta, sem o ano. */
export function formatDayMonth(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseIsoDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Formata `3/10` a partir dos campos de parcela. Vazio quando não há parcela. */
export function formatInstallment(current: number | null, total: number | null): string {
  if (!current || !total) return ''
  return `${current}/${total}`
}

/** Converte input de moeda em pt-BR (`1.234,56`) para número. */
export function parseCurrencyInput(value: string): number {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Data de vencimento real de uma conta fixa no mês, respeitando meses curtos. */
export function billDueDate(referenceMonth: string, dueDay: number): Date {
  const base = parseIsoDate(referenceMonth)
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  return new Date(base.getFullYear(), base.getMonth(), Math.min(dueDay, lastDay))
}

/** Diferença em dias entre duas datas, ignorando horário. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Lê `?mes=2026-03-01` da URL; qualquer outra coisa cai no mês atual. */
export function normalizeMonthParam(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-01$/.test(value)) return value
  if (value && /^\d{4}-\d{2}$/.test(value)) return `${value}-01`
  return toReferenceMonth()
}
