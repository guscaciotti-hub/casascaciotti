import { Suspense } from 'react'
import { PageContainer, PageHeader } from '@/components/page-header'
import { MonthPicker } from '@/components/month-picker'
import { BillsGrid, NewBillDialog, type BillCardData } from '@/components/bills/bills-grid'
import { Skeleton } from '@/components/ui/skeleton'
import { buildBillStatuses, getBillPayments, getCategories, getFixedBills } from '@/lib/queries'
import { normalizeMonthParam, toReferenceMonth } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Contas fixas · Casa Scaciotti' }

export default async function FixedBillsPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const referenceMonth = normalizeMonthParam(searchParams.mes)
  const categories = await getCategories()

  return (
    <PageContainer>
      <PageHeader
        title="Contas fixas"
        description="O que se repete todo mês, em ordem de vencimento."
        action={
          <>
            <MonthPicker value={referenceMonth} />
            <NewBillDialog categories={categories} />
          </>
        }
      />

      <Suspense key={referenceMonth} fallback={<Skeleton className="h-96" />}>
        <BillsContent referenceMonth={referenceMonth} />
      </Suspense>
    </PageContainer>
  )
}

async function BillsContent({ referenceMonth }: { referenceMonth: string }) {
  const [bills, payments, categories] = await Promise.all([
    getFixedBills(),
    getBillPayments(referenceMonth),
    getCategories(),
  ])

  const active = bills.filter((bill) => bill.is_active)

  // O status "vencida" só faz sentido no mês corrente ou nos passados; em um
  // mês futuro nada está atrasado ainda.
  const today = new Date()
  const referenceIsFuture = referenceMonth > toReferenceMonth(today)
  const evaluationDate = referenceIsFuture ? new Date(1970, 0, 1) : today

  const statuses = buildBillStatuses(active, payments, referenceMonth, evaluationDate)

  const cards: BillCardData[] = statuses.map((status) => ({
    bill: status.bill,
    payment: status.payment,
    dueDate: toIsoDate(status.dueDate),
    isPaid: status.isPaid,
    isOverdue: status.isOverdue,
    isDueSoon: status.isDueSoon,
    effectiveAmount: status.effectiveAmount,
    // Sem valor cadastrado, a conta é de valor variável (luz, água, telefone):
    // o que vale é o que o usuário informar ao marcar como paga.
    isVariable: Number(status.bill.amount) === 0,
  }))

  return <BillsGrid bills={cards} categories={categories} referenceMonth={referenceMonth} />
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
