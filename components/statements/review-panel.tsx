'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { ReviewRow, type AiSuggestion, type UnidentifiedTransaction } from '@/components/statements/review-row'
import { CategoryIcon } from '@/components/category-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Category, Merchant } from '@/lib/types'

export interface RecognizedGroup {
  categoryId: string | null
  name: string
  color: string
  icon: string
  total: number
  items: Array<{ id: string; description: string; amount: number; date: string }>
}

/**
 * Tela dividida do pós-import: o que o sistema reconheceu sozinho de um lado,
 * o que precisa de decisão humana do outro.
 */
export function ReviewPanel({
  statementId,
  recognized,
  unidentified,
  categories,
  merchants,
  aiEnabled,
}: {
  statementId: string
  recognized: RecognizedGroup[]
  unidentified: UnidentifiedTransaction[]
  categories: Category[]
  merchants: Merchant[]
  aiEnabled: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [pending, setPending] = React.useState(unidentified)
  const [suggestions, setSuggestions] = React.useState<Record<string, AiSuggestion>>({})
  const [suggesting, setSuggesting] = React.useState(false)

  const recognizedTotal = recognized.reduce((total, group) => total + group.total, 0)
  const pendingTotal = pending.reduce((total, item) => total + item.amount, 0)

  function handleResolved(transactionId: string) {
    setPending((current) => current.filter((item) => item.id !== transactionId))
    router.refresh()
  }

  async function handleSuggest() {
    setSuggesting(true)
    try {
      const response = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptions: pending.map((item) => ({
            id: item.id,
            description: item.normalized_description || item.raw_description,
          })),
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        toast({ variant: 'error', title: 'Sugestão indisponível', description: payload.error })
        return
      }

      setSuggestions(payload.suggestions ?? {})
      toast({
        title: 'Sugestões preenchidas',
        description: 'Confira cada linha antes de salvar — nada foi aplicado sozinho.',
      })
    } catch {
      toast({ variant: 'error', title: 'Não foi possível falar com a IA.' })
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* Não identificados primeiro no mobile: é o que exige ação. */}
      <Card className="order-1 lg:order-2">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Não identificados</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {pending.length === 0
                ? 'Nada pendente.'
                : `${pending.length} ${pending.length === 1 ? 'lançamento' : 'lançamentos'} · ${formatCurrency(pendingTotal)}`}
            </p>
          </div>

          {aiEnabled && pending.length > 0 ? (
            <Button variant="outline" size="sm" onClick={handleSuggest} disabled={suggesting}>
              {suggesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Sugerir com IA
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center px-5 pb-8 pt-2 text-center">
              <CheckCircle2 className="mb-3 h-8 w-8 text-success" />
              <p className="text-sm font-medium">Fatura toda classificada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nos próximos meses, esses estabelecimentos caem sozinhos.
              </p>
              <Button asChild size="sm" className="mt-4">
                <a href={`/faturas/${statementId}`}>Ver a fatura</a>
              </Button>
            </div>
          ) : (
            pending.map((transaction) => (
              <ReviewRow
                key={transaction.id}
                transaction={transaction}
                categories={categories}
                merchants={merchants}
                suggestion={suggestions[transaction.id]}
                onResolved={handleResolved}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="order-2 lg:order-1">
        <CardHeader>
          <CardTitle>Reconhecidos</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {recognized.length === 0
              ? 'Nenhum lançamento reconhecido automaticamente.'
              : `${formatCurrency(recognizedTotal)} classificados por regra existente.`}
          </p>
        </CardHeader>

        <CardContent className="p-0">
          {recognized.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-muted-foreground">
              É a primeira importação? Rotule os lançamentos ao lado — a partir do
              próximo mês eles vêm classificados.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recognized.map((group) => (
                <li key={group.categoryId ?? 'sem-categoria'}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${group.color}1f`, color: group.color }}
                      >
                        <CategoryIcon name={group.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{group.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {group.items.length} {group.items.length === 1 ? 'lançamento' : 'lançamentos'}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-medium">
                        {formatCurrency(group.total)}
                      </span>
                    </summary>

                    <ul className="space-y-1 bg-muted/30 px-5 py-3">
                      {group.items.map((item) => (
                        <li key={item.id} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {formatDate(item.date)} · {item.description}
                          </span>
                          <span className="tabular shrink-0">{formatCurrency(item.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function ReviewSummaryBadges({
  recognizedCount,
  pendingCount,
}: {
  recognizedCount: number
  pendingCount: number
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{recognizedCount} reconhecidos</Badge>
      {pendingCount > 0 ? (
        <Badge variant="outline">{pendingCount} aguardando revisão</Badge>
      ) : (
        <Badge variant="success">tudo classificado</Badge>
      )}
    </div>
  )
}
