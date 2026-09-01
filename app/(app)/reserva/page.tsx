import { PageContainer, PageHeader } from '@/components/page-header'
import { NewAccountDialog, SavingsGrid } from '@/components/savings/savings-grid'
import { SavingsTrend } from '@/components/dashboard/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSavingsAccounts, getSavingsSnapshots } from '@/lib/queries'
import { formatCurrency } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reserva · Casa Scaciotti' }

export default async function SavingsPage() {
  const [accounts, snapshots] = await Promise.all([getSavingsAccounts(), getSavingsSnapshots()])

  const total = accounts.reduce((sum, account) => sum + Number(account.current_balance), 0)

  return (
    <PageContainer>
      <PageHeader
        title="Reserva"
        description={`${formatCurrency(total)} guardados em ${accounts.length} ${accounts.length === 1 ? 'conta' : 'contas'}.`}
        action={accounts.length > 0 ? <NewAccountDialog /> : undefined}
      />

      <SavingsGrid accounts={accounts} />

      {accounts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Evolução do total guardado</CardTitle>
          </CardHeader>
          <CardContent>
            <SavingsTrend data={buildTotalSeries(snapshots)} />
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  )
}

/**
 * Soma o saldo de todas as contas em cada data com snapshot.
 *
 * Contas atualizadas em datas diferentes precisam do último saldo conhecido de
 * cada uma — senão o total despenca no dia em que só uma delas foi atualizada.
 */
function buildTotalSeries(
  snapshots: Array<{ savings_account_id: string; balance: number; snapshot_date: string }>,
): Array<{ date: string; balance: number }> {
  const dates = [...new Set(snapshots.map((snapshot) => snapshot.snapshot_date))].sort()
  const latestByAccount = new Map<string, number>()
  const series: Array<{ date: string; balance: number }> = []

  const byDate = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    byDate.set(snapshot.snapshot_date, [...(byDate.get(snapshot.snapshot_date) ?? []), snapshot])
  }

  for (const date of dates) {
    for (const snapshot of byDate.get(date) ?? []) {
      latestByAccount.set(snapshot.savings_account_id, Number(snapshot.balance))
    }

    const total = [...latestByAccount.values()].reduce((sum, balance) => sum + balance, 0)
    series.push({ date, balance: Math.round(total * 100) / 100 })
  }

  return series
}
