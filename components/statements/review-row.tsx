'use client'

import * as React from 'react'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { labelTransaction } from '@/app/actions/transactions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatInstallment } from '@/lib/format'
import { suggestPattern } from '@/lib/normalize'
import type { Category, Merchant } from '@/lib/types'

const NEW_MERCHANT = '__nova__'

export interface UnidentifiedTransaction {
  id: string
  transaction_date: string
  raw_description: string
  normalized_description: string
  amount: number
  installment_current: number | null
  installment_total: number | null
}

export interface AiSuggestion {
  merchantName: string
  categoryId: string | null
}

/**
 * Uma linha da fila de revisão.
 *
 * Rotular aqui faz três coisas de uma vez: classifica o lançamento, cria o
 * estabelecimento (se novo) e grava a regra que resolve todos os meses
 * seguintes — além de reprocessar o histórico que ainda estava sem categoria.
 */
export function ReviewRow({
  transaction,
  categories,
  merchants,
  suggestion,
  onResolved,
}: {
  transaction: UnidentifiedTransaction
  categories: Category[]
  merchants: Merchant[]
  suggestion?: AiSuggestion
  onResolved: (transactionId: string) => void
}) {
  const { toast } = useToast()

  const [merchantId, setMerchantId] = React.useState<string>(NEW_MERCHANT)
  const [newMerchantName, setNewMerchantName] = React.useState(
    suggestion?.merchantName ?? toTitleCase(transaction.normalized_description),
  )
  const [categoryId, setCategoryId] = React.useState<string>(suggestion?.categoryId ?? '')
  const [createRule, setCreateRule] = React.useState(true)
  const [pattern, setPattern] = React.useState(() =>
    suggestPattern(transaction.normalized_description),
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // A sugestão da IA chega depois da montagem — pré-preenche sem sobrescrever
  // o que o usuário já digitou.
  const appliedSuggestion = React.useRef(false)
  React.useEffect(() => {
    if (!suggestion || appliedSuggestion.current) return
    appliedSuggestion.current = true
    setNewMerchantName(suggestion.merchantName)
    if (suggestion.categoryId) setCategoryId(suggestion.categoryId)
  }, [suggestion])

  const isNewMerchant = merchantId === NEW_MERCHANT
  const merchantLabel = isNewMerchant
    ? newMerchantName.trim()
    : (merchants.find((merchant) => merchant.id === merchantId)?.display_name ?? '')

  async function handleSave() {
    setError(null)

    if (!categoryId) {
      setError('Escolha a categoria.')
      return
    }
    if (isNewMerchant && newMerchantName.trim().length < 2) {
      setError('Dê um nome ao estabelecimento.')
      return
    }

    setSaving(true)
    const result = await labelTransaction({
      transactionId: transaction.id,
      merchantId: isNewMerchant ? null : merchantId,
      newMerchantName: isNewMerchant ? newMerchantName.trim() : null,
      categoryId,
      createRule,
      rulePattern: createRule ? pattern.trim() : null,
    })

    if (!result.ok) {
      setError(result.error)
      setSaving(false)
      return
    }

    const extra = result.data.reprocessed - 1
    toast({
      variant: 'success',
      title: `${merchantLabel} classificado`,
      description:
        result.data.ruleCreated && extra > 0
          ? `A regra também classificou ${extra} ${extra === 1 ? 'lançamento antigo' : 'lançamentos antigos'}.`
          : result.data.ruleCreated
            ? 'Regra criada — os próximos meses vão cair sozinhos.'
            : undefined,
    })

    onResolved(transaction.id)
  }

  return (
    <div className="space-y-4 border-b border-border px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{transaction.raw_description}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(transaction.transaction_date)}
            {transaction.installment_total
              ? ` · parcela ${formatInstallment(transaction.installment_current, transaction.installment_total)}`
              : ''}
            {suggestion ? (
              <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                sugerido por IA
              </span>
            ) : null}
          </p>
        </div>
        <p className="tabular shrink-0 text-sm font-medium">{formatCurrency(transaction.amount)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`merchant-${transaction.id}`} className="text-xs text-muted-foreground">
            Estabelecimento
          </Label>
          <Select value={merchantId} onValueChange={setMerchantId}>
            <SelectTrigger id={`merchant-${transaction.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_MERCHANT}>+ Novo estabelecimento</SelectItem>
              {merchants.map((merchant) => (
                <SelectItem key={merchant.id} value={merchant.id}>
                  {merchant.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isNewMerchant ? (
            <Input
              value={newMerchantName}
              onChange={(event) => setNewMerchantName(event.target.value)}
              placeholder="Ex.: Escola dos meninos"
              aria-label="Nome do novo estabelecimento"
            />
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`category-${transaction.id}`} className="text-xs text-muted-foreground">
            Categoria
          </Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id={`category-${transaction.id}`}>
              <SelectValue placeholder="Escolher categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 rounded-md bg-muted/50 p-3">
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={`rule-${transaction.id}`}
            checked={createRule}
            onCheckedChange={(checked) => setCreateRule(checked === true)}
            className="mt-0.5"
          />
          <Label htmlFor={`rule-${transaction.id}`} className="text-xs font-normal leading-snug">
            Sempre classificar{' '}
            <span className="font-medium">“{pattern || transaction.normalized_description}”</span>{' '}
            como <span className="font-medium">{merchantLabel || 'este estabelecimento'}</span>
          </Label>
        </div>

        {createRule ? (
          <Input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            aria-label="Padrão de correspondência"
            className="h-8 bg-background text-xs"
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}

/** "PASQUALI COM ALIM" -> "Pasquali Com Alim". Ponto de partida editável. */
function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, 80)
}
