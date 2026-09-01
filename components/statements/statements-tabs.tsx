'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, FileText, Trash2 } from 'lucide-react'
import { deleteStatement, statementDownloadUrl } from '@/app/actions/statements'
import { ConfirmButton } from '@/components/confirm-button'
import { TransactionList, type ListedTransaction } from '@/components/statements/transaction-list'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatMonthLabel } from '@/lib/format'
import { SOURCE_OPTIONS } from '@/lib/parsers'
import type { Category, Merchant, Statement } from '@/lib/types'

export function StatementsTabs({
  statements,
  transactions,
  categories,
  merchants,
  initialCategoryId,
  initialOnlyUnidentified,
  defaultTab,
}: {
  statements: Statement[]
  transactions: ListedTransaction[]
  categories: Category[]
  merchants: Merchant[]
  initialCategoryId?: string
  initialOnlyUnidentified: boolean
  defaultTab: 'faturas' | 'lancamentos'
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="faturas">Faturas ({statements.length})</TabsTrigger>
        <TabsTrigger value="lancamentos">Lançamentos do mês ({transactions.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="faturas">
        <StatementCards statements={statements} />
      </TabsContent>

      <TabsContent value="lancamentos">
        <TransactionList
          transactions={transactions}
          categories={categories}
          merchants={merchants}
          initialCategoryId={initialCategoryId}
          initialOnlyUnidentified={initialOnlyUnidentified}
          emptyMessage="Nenhum lançamento neste mês"
        />
      </TabsContent>
    </Tabs>
  )
}

function StatementCards({ statements }: { statements: Statement[] }) {
  const router = useRouter()
  const { toast } = useToast()

  const grouped = React.useMemo<Array<[string, Statement[]]>>(() => {
    const map = new Map<string, Statement[]>()
    for (const statement of statements) {
      const key = statement.reference_month
      map.set(key, [...(map.get(key) ?? []), statement])
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [statements])

  async function handleDownload(statementId: string) {
    const result = await statementDownloadUrl(statementId)
    if (!result.ok) {
      toast({ variant: 'error', title: 'PDF indisponível', description: result.error })
      return
    }
    window.open(result.data, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(statementId: string) {
    const result = await deleteStatement(statementId)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir', description: result.error })
      return
    }
    toast({ title: 'Fatura excluída' })
    router.refresh()
  }

  if (statements.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">Nenhuma fatura importada ainda.</p>
  }

  return (
    <div className="space-y-6">
      {grouped.map(([month, items]) => (
        <section key={month} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{formatMonthLabel(month)}</h2>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((statement) => (
              <li key={statement.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />

                <Link href={`/faturas/${statement.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sourceLabel(statement.source)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Importada em {formatDate(statement.imported_at)}
                    {statement.due_date ? ` · vence ${formatDate(statement.due_date)}` : ''}
                  </p>
                </Link>

                <span className="tabular shrink-0 text-sm font-medium">
                  {formatCurrency(statement.total_amount)}
                </span>

                <div className="flex shrink-0 items-center">
                  {statement.file_url ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Baixar PDF"
                      onClick={() => handleDownload(statement.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  ) : null}

                  <ConfirmButton
                    title="Excluir esta fatura?"
                    description="Os lançamentos importados por ela e o PDF guardado saem junto. As regras de categorização continuam."
                    confirmLabel="Excluir fatura"
                    onConfirm={() => handleDelete(statement.id)}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label="Excluir fatura">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function sourceLabel(source: string): string {
  return SOURCE_OPTIONS.find((option) => option.id === source)?.label ?? source
}
