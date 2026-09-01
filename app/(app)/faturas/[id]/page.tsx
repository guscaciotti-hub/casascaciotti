import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ListChecks } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/page-header'
import { TransactionList, type ListedTransaction } from '@/components/statements/transaction-list'
import { Button } from '@/components/ui/button'
import { getCategories, getMerchants, getStatement, getStatementTransactions } from '@/lib/queries'
import { formatCurrency, formatDate, formatMonthLabel } from '@/lib/format'
import { SOURCE_OPTIONS } from '@/lib/parsers'

export const dynamic = 'force-dynamic'

export default async function StatementDetailPage({ params }: { params: { id: string } }) {
  const statement = await getStatement(params.id)
  if (!statement) notFound()

  const [transactions, categories, merchants] = await Promise.all([
    getStatementTransactions(params.id),
    getCategories(),
    getMerchants(),
  ])

  const listed: ListedTransaction[] = transactions.map((transaction) => ({
    id: transaction.id,
    transaction_date: transaction.transaction_date,
    raw_description: transaction.raw_description,
    normalized_description: transaction.normalized_description,
    amount: Number(transaction.amount),
    installment_current: transaction.installment_current,
    installment_total: transaction.installment_total,
    merchant_id: transaction.merchant_id,
    category_id: transaction.category_id,
    merchantName: transaction.merchant?.display_name ?? null,
    categoryName: transaction.category?.name ?? null,
    categoryColor: transaction.category?.color ?? null,
    categoryIcon: transaction.category?.icon ?? null,
    source: statement.source,
  }))

  const pending = listed.filter((transaction) => transaction.merchant_id === null).length
  const label = SOURCE_OPTIONS.find((option) => option.id === statement.source)?.label ?? statement.source

  return (
    <PageContainer>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/faturas">
          <ArrowLeft className="h-4 w-4" />
          Faturas
        </Link>
      </Button>

      <PageHeader
        title={`${label} · ${formatMonthLabel(statement.reference_month)}`}
        description={[
          formatCurrency(statement.total_amount),
          statement.due_date ? `vence ${formatDate(statement.due_date)}` : null,
          statement.file_name,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          pending > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/revisao/${statement.id}`}>
                <ListChecks className="h-4 w-4" />
                Revisar {pending}
              </Link>
            </Button>
          ) : null
        }
      />

      <TransactionList
        transactions={listed}
        categories={categories}
        merchants={merchants}
        emptyMessage="Nenhum lançamento nesta fatura"
      />
    </PageContainer>
  )
}
