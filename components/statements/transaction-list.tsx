'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { deleteTransaction, reclassifyTransaction } from '@/app/actions/transactions'
import { CategoryIcon } from '@/components/category-icon'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { ConfirmButton } from '@/components/confirm-button'
import { formatCurrency, formatDate, formatInstallment } from '@/lib/format'
import { labelTransaction } from '@/app/actions/transactions'
import { suggestPattern } from '@/lib/normalize'
import type { Category, Merchant } from '@/lib/types'

const ALL = '__todas__'
const NEW_MERCHANT = '__nova__'

export interface ListedTransaction {
  id: string
  transaction_date: string
  raw_description: string
  normalized_description: string
  amount: number
  installment_current: number | null
  installment_total: number | null
  merchant_id: string | null
  category_id: string | null
  merchantName: string | null
  categoryName: string | null
  categoryColor: string | null
  categoryIcon: string | null
  source: string | null
}

/**
 * Lista de lançamentos com busca por descrição, filtro por categoria e
 * reclassificação linha a linha. Toda tabela grande da casa tem esses dois.
 */
export function TransactionList({
  transactions,
  categories,
  merchants,
  initialCategoryId,
  initialOnlyUnidentified = false,
  emptyMessage = 'Nenhum lançamento por aqui.',
}: {
  transactions: ListedTransaction[]
  categories: Category[]
  merchants: Merchant[]
  initialCategoryId?: string
  initialOnlyUnidentified?: boolean
  emptyMessage?: string
}) {
  const [search, setSearch] = React.useState('')
  const [categoryId, setCategoryId] = React.useState(initialCategoryId || ALL)
  const [onlyUnidentified, setOnlyUnidentified] = React.useState(initialOnlyUnidentified)
  const [editing, setEditing] = React.useState<ListedTransaction | null>(null)

  const filtered = React.useMemo(() => {
    const term = search
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()

    return transactions.filter((transaction) => {
      if (categoryId !== ALL && transaction.category_id !== categoryId) return false
      if (onlyUnidentified && transaction.merchant_id !== null) return false
      if (!term) return true

      const haystack = [
        transaction.raw_description,
        transaction.normalized_description,
        transaction.merchantName ?? '',
        transaction.categoryName ?? '',
      ]
        .join(' ')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [transactions, search, categoryId, onlyUnidentified])

  const total = filtered.reduce((sum, transaction) => sum + transaction.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por descrição ou estabelecimento"
            className="pl-9"
            aria-label="Buscar lançamentos"
          />
        </div>

        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar por categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={onlyUnidentified}
            onCheckedChange={(checked) => setOnlyUnidentified(checked === true)}
          />
          Só os não identificados
        </label>

        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
          <span className="tabular font-medium text-foreground">{formatCurrency(total)}</span>
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title={emptyMessage} description="Ajuste a busca ou o filtro." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((transaction) => (
            <li
              key={transaction.id}
              className="flex items-center gap-3 px-3 py-3 sm:px-4"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: `${transaction.categoryColor ?? '#94a3b8'}1f`,
                  color: transaction.categoryColor ?? '#94a3b8',
                }}
              >
                <CategoryIcon name={transaction.categoryIcon} className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {transaction.merchantName ?? transaction.raw_description}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(transaction.transaction_date)}
                  {transaction.categoryName ? ` · ${transaction.categoryName}` : ''}
                  {transaction.installment_total
                    ? ` · ${formatInstallment(transaction.installment_current, transaction.installment_total)}`
                    : ''}
                  {transaction.merchantName ? ` · ${transaction.raw_description}` : ''}
                </p>
              </div>

              {transaction.merchant_id === null ? (
                <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                  revisar
                </Badge>
              ) : null}

              <span className="tabular shrink-0 text-sm font-medium">
                {formatCurrency(transaction.amount)}
              </span>

              <Button
                variant="ghost"
                size="icon"
                aria-label={`Reclassificar ${transaction.raw_description}`}
                onClick={() => setEditing(transaction)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ReclassifyDialog
        transaction={editing}
        categories={categories}
        merchants={merchants}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function ReclassifyDialog({
  transaction,
  categories,
  merchants,
  onClose,
}: {
  transaction: ListedTransaction | null
  categories: Category[]
  merchants: Merchant[]
  onClose: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [merchantId, setMerchantId] = React.useState<string>(ALL)
  const [newMerchantName, setNewMerchantName] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [createRule, setCreateRule] = React.useState(false)
  const [pattern, setPattern] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!transaction) return
    setMerchantId(transaction.merchant_id ?? NEW_MERCHANT)
    setNewMerchantName(transaction.merchantName ?? '')
    setCategoryId(transaction.category_id ?? '')
    setCreateRule(transaction.merchant_id === null)
    setPattern(suggestPattern(transaction.normalized_description))
    setError(null)
  }, [transaction])

  if (!transaction) return null

  const isNewMerchant = merchantId === NEW_MERCHANT

  async function handleSave() {
    if (!transaction) return
    setError(null)

    if (!categoryId) {
      setError('Escolha a categoria.')
      return
    }

    setSaving(true)

    // Sem regra nova e com merchant existente, basta reclassificar a linha.
    const result =
      !createRule && !isNewMerchant
        ? await reclassifyTransaction(transaction.id, { merchantId, categoryId })
        : await labelTransaction({
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

    toast({ variant: 'success', title: 'Lançamento reclassificado' })
    setSaving(false)
    onClose()
    router.refresh()
  }

  async function handleDelete() {
    if (!transaction) return
    const result = await deleteTransaction(transaction.id)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir', description: result.error })
      return
    }

    toast({ title: 'Lançamento excluído' })
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reclassificar lançamento</DialogTitle>
          <DialogDescription className="break-words">
            {transaction.raw_description} · {formatCurrency(transaction.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reclassify-merchant">Estabelecimento</Label>
            <Select value={merchantId} onValueChange={setMerchantId}>
              <SelectTrigger id="reclassify-merchant">
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
                placeholder="Nome amigável"
                aria-label="Nome do novo estabelecimento"
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reclassify-category">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="reclassify-category">
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

          <div className="space-y-2 rounded-md bg-muted/50 p-3">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-snug">
              <Checkbox
                checked={createRule}
                onCheckedChange={(checked) => setCreateRule(checked === true)}
                className="mt-0.5"
              />
              <span>
                Criar regra: sempre classificar{' '}
                <span className="font-medium">“{pattern}”</span> assim
              </span>
            </label>

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
        </div>

        <DialogFooter className="sm:justify-between">
          <ConfirmButton
            title="Excluir lançamento?"
            description="O lançamento sai do histórico. Reimportar a fatura o traz de volta."
            confirmLabel="Excluir"
            onConfirm={handleDelete}
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="h-4 w-4" />
                Excluir
              </Button>
            }
          />

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
