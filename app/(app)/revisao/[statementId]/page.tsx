import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/page-header'
import { ReviewPanel, ReviewSummaryBadges, type RecognizedGroup } from '@/components/statements/review-panel'
import { Button } from '@/components/ui/button'
import { getCategories, getMerchants, getStatement, getStatementTransactions } from '@/lib/queries'
import { formatMonthLabel } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Revisar importação · Casa Scaciotti' }

export default async function ReviewPage({ params }: { params: { statementId: string } }) {
  const statement = await getStatement(params.statementId)
  if (!statement) notFound()

  const [transactions, categories, merchants] = await Promise.all([
    getStatementTransactions(params.statementId),
    getCategories(),
    getMerchants(),
  ])

  const recognized = transactions.filter((row) => row.merchant_id !== null)
  const unidentified = transactions
    .filter((row) => row.merchant_id === null)
    .map((row) => ({
      id: row.id,
      transaction_date: row.transaction_date,
      raw_description: row.raw_description,
      normalized_description: row.normalized_description,
      amount: Number(row.amount),
      installment_current: row.installment_current,
      installment_total: row.installment_total,
    }))

  return (
    <PageContainer>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/faturas">
          <ArrowLeft className="h-4 w-4" />
          Faturas
        </Link>
      </Button>

      <PageHeader
        title="Revisar importação"
        description={`${statement.source} · ${formatMonthLabel(statement.reference_month)}`}
        action={
          <ReviewSummaryBadges
            recognizedCount={recognized.length}
            pendingCount={unidentified.length}
          />
        }
      />

      <ReviewPanel
        statementId={statement.id}
        recognized={groupByCategory(recognized)}
        unidentified={unidentified}
        categories={categories}
        merchants={merchants}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </PageContainer>
  )
}

/** Agrupa os reconhecidos por categoria, com total, para a lista compacta. */
function groupByCategory(
  transactions: Awaited<ReturnType<typeof getStatementTransactions>>,
): RecognizedGroup[] {
  const groups = new Map<string, RecognizedGroup>()

  for (const transaction of transactions) {
    const key = transaction.category?.id ?? 'sem-categoria'

    if (!groups.has(key)) {
      groups.set(key, {
        categoryId: transaction.category?.id ?? null,
        name: transaction.category?.name ?? 'Sem categoria',
        color: transaction.category?.color ?? '#94a3b8',
        icon: transaction.category?.icon ?? 'circle-help',
        total: 0,
        items: [],
      })
    }

    const group = groups.get(key)!
    group.total += Number(transaction.amount)
    group.items.push({
      id: transaction.id,
      description: transaction.merchant?.display_name ?? transaction.raw_description,
      amount: Number(transaction.amount),
      date: transaction.transaction_date,
    })
  }

  return [...groups.values()].sort((a, b) => b.total - a.total)
}
