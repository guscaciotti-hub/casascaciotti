import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert, Upload } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/page-header'
import { MonthPicker } from '@/components/month-picker'
import { CategoryDonut, MonthlyTrend } from '@/components/dashboard/charts'
import { CategoryIcon } from '@/components/category-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getDashboardData } from '@/lib/queries'
import {
  formatCurrency,
  formatDayMonth,
  formatMonthLabel,
  formatMonthName,
  formatPercent,
  normalizeMonthParam,
} from '@/lib/format'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const referenceMonth = normalizeMonthParam(searchParams.mes)

  return (
    <PageContainer>
      <PageHeader
        title="Visão do mês"
        description="O mês da fatura, não o da compra: cada mês mostra o dinheiro que sai nele."
        action={<MonthPicker value={referenceMonth} />}
      />

      <Suspense key={referenceMonth} fallback={<DashboardSkeleton />}>
        <DashboardContent referenceMonth={referenceMonth} />
      </Suspense>
    </PageContainer>
  )
}

async function DashboardContent({ referenceMonth }: { referenceMonth: string }) {
  const data = await getDashboardData(referenceMonth)

  const pendingBillsTotal = data.pendingBills.reduce(
    (total, status) => total + status.effectiveAmount,
    0,
  )
  const monthChange =
    data.previousTotal > 0 ? (data.totalSpent - data.previousTotal) / data.previousTotal : null

  return (
    <div className="space-y-6">
      {data.unidentified > 0 ? (
        <Link
          href="/faturas?filtro=nao-identificados"
          className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm transition-colors hover:bg-muted"
        >
          <TriangleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {data.unidentified === 1
              ? '1 lançamento aguarda revisão.'
              : `${data.unidentified} lançamentos aguardam revisão.`}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Revisar →</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={`A pagar em ${formatMonthName(referenceMonth)}`}
          value={formatCurrency(data.totalSpent)}
          hint={
            monthChange === null
              ? `${data.transactionCount} lançamentos`
              : `${monthChange > 0 ? '+' : ''}${formatPercent(monthChange)} vs. mês anterior`
          }
          tone={monthChange !== null && monthChange > 0 ? 'up' : monthChange !== null ? 'down' : 'flat'}
          sub={describeInvoicePeriod(data.lastPurchase, data.dueDates)}
        />
        <StatCard
          label="Contas fixas pendentes"
          value={formatCurrency(pendingBillsTotal)}
          hint={
            data.pendingBills.length === 0
              ? 'Tudo pago neste mês'
              : `${data.pendingBills.length} de ${data.billStatuses.length} em aberto`
          }
          href="/contas-fixas"
        />
        <StatCard
          label="Total guardado"
          value={formatCurrency(data.savingsTotal)}
          hint="Somando todas as reservas"
          href="/reserva"
        />
        <StatCard
          label="Parcelas futuras"
          value={formatCurrency(data.futureInstallments)}
          hint="Já comprometido nos próximos meses"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut
              data={data.breakdown.map((row) => ({
                name: row.name,
                color: row.color,
                total: row.total,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolução do que sai por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyTrend data={data.monthlyTotals} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categorias em {formatMonthLabel(referenceMonth).toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.breakdown.length === 0 ? (
            <div className="px-5 pb-6 pt-2">
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento neste mês ainda.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/faturas/importar">
                  <Upload className="h-4 w-4" />
                  Importar fatura
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.breakdown.map((row) => (
                <li key={row.categoryId ?? 'sem-categoria'}>
                  <Link
                    href={`/faturas?categoria=${row.categoryId ?? ''}&mes=${referenceMonth}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/50"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${row.color}1f`, color: row.color }}
                    >
                      <CategoryIcon name={row.icon} className="h-4 w-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatPercent(row.share)} do mês
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="tabular block text-sm font-medium">
                        {formatCurrency(row.total)}
                      </span>
                      <ChangeIndicator change={row.change} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Descreve o que a fatura do mês realmente representa: compras feitas antes,
 * cobradas agora. Sem isso, "A pagar em setembro" some com a informação de que
 * as compras são de agosto.
 */
function describeInvoicePeriod(lastPurchase: string | null, dueDates: string[]): string | undefined {
  const parts: string[] = []

  if (lastPurchase) parts.push(`compras até ${formatDayMonth(lastPurchase)}`)
  if (dueDates.length === 1) parts.push(`vence ${formatDayMonth(dueDates[0])}`)
  else if (dueDates.length > 1) parts.push(`vencem ${dueDates.map(formatDayMonth).join(' e ')}`)

  return parts.length > 0 ? parts.join(' · ') : undefined
}

function StatCard({
  label,
  value,
  hint,
  sub,
  href,
  tone = 'flat',
}: {
  label: string
  value: string
  hint: string
  /** Linha secundária, para contexto que o rótulo não cabe. */
  sub?: string
  href?: string
  tone?: 'up' | 'down' | 'flat'
}) {
  const content = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">{value}</p>
      <p
        className={cn(
          'mt-1 text-xs',
          tone === 'up' && 'text-destructive',
          tone === 'down' && 'text-success',
          tone === 'flat' && 'text-muted-foreground',
        )}
      >
        {hint}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40"
      >
        {content}
      </Link>
    )
  }

  return <div className="rounded-lg border border-border bg-card p-4">{content}</div>
}

/** Seta verde/vermelha comparando com o mês anterior. */
function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="block text-xs text-muted-foreground">novo</span>
  }

  if (Math.abs(change) < 0.005) {
    return (
      <span className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        estável
      </span>
    )
  }

  const isUp = change > 0
  const Icon = isUp ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'flex items-center justify-end gap-0.5 text-xs',
        isUp ? 'text-destructive' : 'text-success',
      )}
    >
      <Icon className="h-3 w-3" />
      {formatPercent(Math.abs(change))}
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[92px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
