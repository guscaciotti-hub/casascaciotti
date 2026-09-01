import { Suspense } from 'react'
import Link from 'next/link'
import { CreditCard, Upload } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/page-header'
import { MonthPicker } from '@/components/month-picker'
import { EmptyState } from '@/components/empty-state'
import { StatementsTabs } from '@/components/statements/statements-tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getCategories,
  getMerchants,
  getMonthTransactions,
  getStatements,
} from '@/lib/queries'
import { normalizeMonthParam } from '@/lib/format'
import type { ListedTransaction } from '@/components/statements/transaction-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Faturas · Casa Scaciotti' }

export default function StatementsPage({
  searchParams,
}: {
  searchParams: { mes?: string; categoria?: string; filtro?: string }
}) {
  const referenceMonth = normalizeMonthParam(searchParams.mes)

  return (
    <PageContainer>
      <PageHeader
        title="Faturas"
        description="Tudo o que entrou pelo cartão, mês a mês."
        action={
          <>
            <MonthPicker value={referenceMonth} />
            <Button asChild size="sm">
              <Link href="/faturas/importar">
                <Upload className="h-4 w-4" />
                Importar
              </Link>
            </Button>
          </>
        }
      />

      <Suspense key={referenceMonth} fallback={<Skeleton className="h-96" />}>
        <StatementsContent
          referenceMonth={referenceMonth}
          categoryId={searchParams.categoria}
          onlyUnidentified={searchParams.filtro === 'nao-identificados'}
        />
      </Suspense>
    </PageContainer>
  )
}

async function StatementsContent({
  referenceMonth,
  categoryId,
  onlyUnidentified,
}: {
  referenceMonth: string
  categoryId?: string
  onlyUnidentified: boolean
}) {
  const [statements, transactions, categories, merchants] = await Promise.all([
    getStatements(),
    getMonthTransactions(referenceMonth),
    getCategories(),
    getMerchants(),
  ])

  if (statements.length === 0 && transactions.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Nenhuma fatura importada ainda"
        description="Suba o PDF da fatura do cartão. Cada lançamento vira uma linha, agrupada pela categoria do estabelecimento."
        action={
          <Button asChild>
            <Link href="/faturas/importar">
              <Upload className="h-4 w-4" />
              Importar primeira fatura
            </Link>
          </Button>
        }
      />
    )
  }

  const byCategory = new Map(categories.map((category) => [category.id, category]))
  const byMerchant = new Map(merchants.map((merchant) => [merchant.id, merchant]))

  const listed: ListedTransaction[] = transactions.map((transaction) => {
    const category = transaction.category_id ? byCategory.get(transaction.category_id) : undefined
    const merchant = transaction.merchant_id ? byMerchant.get(transaction.merchant_id) : undefined

    return {
      id: transaction.id,
      transaction_date: transaction.transaction_date,
      raw_description: transaction.raw_description,
      normalized_description: transaction.normalized_description,
      amount: Number(transaction.amount),
      installment_current: transaction.installment_current,
      installment_total: transaction.installment_total,
      merchant_id: transaction.merchant_id,
      category_id: transaction.category_id,
      merchantName: merchant?.display_name ?? null,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      categoryIcon: category?.icon ?? null,
      source: transaction.statement_source,
    }
  })

  return (
    <StatementsTabs
      statements={statements}
      transactions={listed}
      categories={categories}
      merchants={merchants}
      initialCategoryId={categoryId}
      initialOnlyUnidentified={onlyUnidentified}
      defaultTab={categoryId || onlyUnidentified ? 'lancamentos' : 'faturas'}
    />
  )
}
