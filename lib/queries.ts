import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { addMonths, billDueDate, lastMonths, parseIsoDate } from '@/lib/format'
import type {
  BillPayment,
  Category,
  FixedBill,
  Merchant,
  MerchantRule,
  SavingsAccount,
  SavingsSnapshot,
  Statement,
} from '@/lib/types'

/**
 * Leituras usadas pelas telas. Ficam juntas de propósito: o volume é pequeno
 * (duas pessoas, algumas centenas de linhas por mês), então preferimos agregar
 * em TypeScript a espalhar SQL pelos componentes.
 */

export interface MonthlyTransaction {
  id: string
  transaction_date: string
  raw_description: string
  normalized_description: string
  amount: number
  installment_current: number | null
  installment_total: number | null
  merchant_id: string | null
  category_id: string | null
  is_reviewed: boolean
  /** Pagamento da própria fatura: fica fora do gasto do mês. */
  is_payment: boolean
  notes: string | null
  statement_id: string | null
  reference_month: string
  statement_source: string | null
}

export async function getCategories(): Promise<Category[]> {
  const supabase = createClient()
  const { data } = await supabase.from('categories').select('*').order('name')
  return (data ?? []) as Category[]
}

export async function getMerchants(): Promise<Merchant[]> {
  const supabase = createClient()
  const { data } = await supabase.from('merchants').select('*').order('display_name')
  return (data ?? []) as Merchant[]
}

export async function getMerchantRules(): Promise<MerchantRule[]> {
  const supabase = createClient()
  const { data } = await supabase.from('merchant_rules').select('*').order('priority')
  return (data ?? []) as MerchantRule[]
}

/**
 * Lançamentos de um mês, já com o mês resolvido pela view.
 *
 * Pagamento da própria fatura fica de fora por padrão: ele é transferência,
 * não consumo, e somá-lo zeraria o gasto do mês. Passe
 * `includePayments: true` para ver a fatura inteira, como ela veio do banco.
 */
export async function getMonthTransactions(
  referenceMonth: string,
  options: { includePayments?: boolean } = {},
): Promise<MonthlyTransaction[]> {
  const supabase = createClient()
  let query = supabase
    .from('transactions_monthly')
    .select('*')
    .eq('reference_month', referenceMonth)

  if (!options.includePayments) query = query.eq('is_payment', false)

  const { data } = await query.order('transaction_date', { ascending: false })

  return (data ?? []) as MonthlyTransaction[]
}

/** Total de despesa (ignorando estornos) por mês, para a série de 12 meses. */
export async function getMonthlyTotals(
  referenceMonth: string,
  months = 12,
): Promise<Array<{ month: string; total: number }>> {
  const supabase = createClient()
  const range = lastMonths(referenceMonth, months)

  const { data } = await supabase
    .from('transactions_monthly')
    .select('amount, reference_month')
    .eq('is_payment', false)
    .gte('reference_month', range[0])
    .lte('reference_month', range[range.length - 1])

  const totals = new Map(range.map((month) => [month, 0]))
  for (const row of data ?? []) {
    const month = row.reference_month as string
    if (!totals.has(month)) continue
    // Estorno abate o gasto do mês, mas nunca deixa o total negativo.
    totals.set(month, (totals.get(month) ?? 0) + Number(row.amount))
  }

  return range.map((month) => ({ month, total: Math.max(0, round2(totals.get(month) ?? 0)) }))
}

export async function getStatements(): Promise<Statement[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('statements')
    .select('*')
    .order('reference_month', { ascending: false })
    .order('imported_at', { ascending: false })

  return (data ?? []) as Statement[]
}

export async function getStatement(id: string): Promise<Statement | null> {
  const supabase = createClient()
  const { data } = await supabase.from('statements').select('*').eq('id', id).maybeSingle()
  return (data as Statement) ?? null
}

export async function getStatementTransactions(statementId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('transactions')
    .select('*, category:categories(id, name, color, icon), merchant:merchants(id, display_name)')
    .eq('statement_id', statementId)
    .order('transaction_date', { ascending: false })

  return (data ?? []) as Array<
    MonthlyTransaction & {
      category: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null
      merchant: Pick<Merchant, 'id' | 'display_name'> | null
    }
  >
}

/** Quantos lançamentos aguardam revisão. Alimenta o alerta do dashboard. */
export async function countUnidentified(): Promise<number> {
  const supabase = createClient()
  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .is('merchant_id', null)
    .eq('is_payment', false)

  return count ?? 0
}

export async function getFixedBills(): Promise<FixedBill[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('fixed_bills')
    .select('*')
    // A ordem é a da planilha: onde a pessoa colocou a linha. Ordenar por
    // vencimento embaralharia a lista que ela conhece de cor.
    .order('sort_order')
    .order('created_at')

  return (data ?? []) as FixedBill[]
}

export async function getBillPayments(referenceMonth: string): Promise<BillPayment[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bill_payments')
    .select('*')
    .eq('reference_month', referenceMonth)

  return (data ?? []) as BillPayment[]
}

export async function getSavingsAccounts(): Promise<SavingsAccount[]> {
  const supabase = createClient()
  const { data } = await supabase.from('savings_accounts').select('*').order('name')
  return (data ?? []) as SavingsAccount[]
}

export async function getSavingsSnapshots(): Promise<SavingsSnapshot[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('savings_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })

  return (data ?? []) as SavingsSnapshot[]
}

// ---------------------------------------------------------------------------
// Agregações do dashboard
// ---------------------------------------------------------------------------

export interface CategoryBreakdownRow {
  categoryId: string | null
  name: string
  color: string
  icon: string
  total: number
  share: number
  previousTotal: number
  /** Variação relativa ao mês anterior. `null` quando não havia base. */
  change: number | null
}

export function buildCategoryBreakdown(
  categories: Category[],
  current: MonthlyTransaction[],
  previous: MonthlyTransaction[],
): CategoryBreakdownRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]))

  const sum = (rows: MonthlyTransaction[]) => {
    const totals = new Map<string | null, number>()
    for (const row of rows) {
      // Estornos abatem a categoria em que caíram, mas não viram receita.
      const key = row.category_id
      totals.set(key, (totals.get(key) ?? 0) + Number(row.amount))
    }
    return totals
  }

  const currentTotals = sum(current)
  const previousTotals = sum(previous)
  const grandTotal = [...currentTotals.values()].reduce((total, value) => total + Math.max(0, value), 0)

  const rows: CategoryBreakdownRow[] = []
  for (const [categoryId, rawTotal] of currentTotals) {
    const total = round2(Math.max(0, rawTotal))
    if (total === 0) continue

    const category = categoryId ? byId.get(categoryId) : undefined
    const previousTotal = round2(Math.max(0, previousTotals.get(categoryId) ?? 0))

    rows.push({
      categoryId,
      name: category?.name ?? 'Sem categoria',
      color: category?.color ?? '#94a3b8',
      icon: category?.icon ?? 'circle-help',
      total,
      share: grandTotal > 0 ? total / grandTotal : 0,
      previousTotal,
      change: previousTotal > 0 ? (total - previousTotal) / previousTotal : null,
    })
  }

  return rows.sort((a, b) => b.total - a.total)
}

/** Soma comprometida nas parcelas que ainda vão cair nos próximos meses. */
export function futureInstallmentsTotal(transactions: MonthlyTransaction[]): number {
  return round2(
    transactions.reduce((total, row) => {
      if (!row.installment_current || !row.installment_total) return total
      if (row.amount <= 0) return total

      const remaining = row.installment_total - row.installment_current
      if (remaining <= 0) return total

      return total + Number(row.amount) * remaining
    }, 0),
  )
}

export interface BillStatus {
  bill: FixedBill
  payment: BillPayment | null
  dueDate: Date
  isPaid: boolean
  isOverdue: boolean
  isDueSoon: boolean
  effectiveAmount: number
}

const DUE_SOON_DAYS = 5

/** Cruza contas fixas com os pagamentos do mês e classifica cada uma. */
export function buildBillStatuses(
  bills: FixedBill[],
  payments: BillPayment[],
  referenceMonth: string,
  today = new Date(),
): BillStatus[] {
  const byBill = new Map(payments.map((payment) => [payment.fixed_bill_id, payment]))

  return bills
    .map((bill) => {
      const payment = byBill.get(bill.id) ?? null
      // O vencimento do mês, quando informado na planilha, vale mais que o dia
      // padrão da conta: é ele que a pessoa olha.
      const dueDate = payment?.due_date
        ? parseIsoDate(payment.due_date)
        : billDueDate(referenceMonth, bill.due_day)
      const isPaid = payment?.is_paid ?? false
      const daysToDue = daysUntil(today, dueDate)

      return {
        bill,
        payment,
        dueDate,
        isPaid,
        isOverdue: !isPaid && daysToDue < 0,
        isDueSoon: !isPaid && daysToDue >= 0 && daysToDue <= DUE_SOON_DAYS,
        // O que saiu de fato manda; sem isso, o valor lançado no mês; sem isso,
        // o valor cadastrado na conta.
        effectiveAmount: Number(payment?.amount_paid ?? payment?.amount_due ?? bill.amount),
      }
    })
    .sort((a, b) => a.bill.sort_order - b.bill.sort_order || a.bill.name.localeCompare(b.bill.name))
}

function daysUntil(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Vencimentos das faturas cujo mês de referência é o informado. */
export async function getMonthDueDates(referenceMonth: string): Promise<string[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('statements')
    .select('due_date')
    .eq('reference_month', referenceMonth)
    .not('due_date', 'is', null)
    .order('due_date')

  return (data ?? []).map((row) => row.due_date as string)
}

/** Carrega tudo que o dashboard precisa, para um mês. */
export async function getDashboardData(referenceMonth: string) {
  const previousMonth = addMonths(referenceMonth, -1)

  const [
    categories,
    current,
    previous,
    monthlyTotals,
    bills,
    payments,
    savings,
    unidentified,
  ] = await Promise.all([
    getCategories(),
    getMonthTransactions(referenceMonth),
    getMonthTransactions(previousMonth),
    getMonthlyTotals(referenceMonth, 12),
    getFixedBills(),
    getBillPayments(referenceMonth),
    getSavingsAccounts(),
    countUnidentified(),
  ])

  const dueDates = await getMonthDueDates(referenceMonth)

  // O mês da fatura não é o mês da compra: uma fatura que vence em setembro
  // cobra o que foi comprado em agosto. Guardamos a data da compra mais recente
  // para que o dashboard possa dizer isso em vez de deixar subentendido.
  const purchaseDates = current.map((row) => row.transaction_date).sort()
  const lastPurchase = purchaseDates[purchaseDates.length - 1] ?? null

  const activeBills = bills.filter((bill) => bill.is_active)
  const billStatuses = buildBillStatuses(activeBills, payments, referenceMonth)

  const totalSpent = round2(
    Math.max(0, current.reduce((total, row) => total + Number(row.amount), 0)),
  )
  const previousTotal = round2(
    Math.max(0, previous.reduce((total, row) => total + Number(row.amount), 0)),
  )

  return {
    referenceMonth,
    categories,
    breakdown: buildCategoryBreakdown(categories, current, previous),
    monthlyTotals,
    totalSpent,
    previousTotal,
    billStatuses,
    pendingBills: billStatuses.filter((status) => !status.isPaid),
    savingsTotal: round2(
      savings.reduce((total, account) => total + Number(account.current_balance), 0),
    ),
    futureInstallments: futureInstallmentsTotal(current),
    unidentified,
    transactionCount: current.length,
    dueDates,
    lastPurchase,
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
