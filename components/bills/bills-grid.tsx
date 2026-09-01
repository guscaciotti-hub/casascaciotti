'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  createFixedBill,
  deleteFixedBill,
  toggleBillPayment,
  updateFixedBill,
  type FixedBillInput,
} from '@/app/actions/bills'
import { CategoryIcon } from '@/components/category-icon'
import { ConfirmButton } from '@/components/confirm-button'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, parseCurrencyInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BillPayment, Category, FixedBill } from '@/lib/types'

export interface BillCardData {
  bill: FixedBill
  payment: BillPayment | null
  dueDate: string
  isPaid: boolean
  isOverdue: boolean
  isDueSoon: boolean
  effectiveAmount: number
}

export function BillsGrid({
  bills,
  categories,
  referenceMonth,
}: {
  bills: BillCardData[]
  categories: Category[]
  referenceMonth: string
}) {
  const total = bills.reduce((sum, item) => sum + item.effectiveAmount, 0)
  const pending = bills.filter((item) => !item.isPaid)
  const pendingTotal = pending.reduce((sum, item) => sum + item.effectiveAmount, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryTile label="Total do mês" value={formatCurrency(total)} />
        <SummaryTile label="Em aberto" value={formatCurrency(pendingTotal)} />
        <SummaryTile
          label="Pagas"
          value={`${bills.length - pending.length} de ${bills.length}`}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {bills.length === 0 ? (
        <EmptyState
          title="Nenhuma conta fixa cadastrada"
          description="Aluguel, escola, internet, streaming — o que se repete todo mês entra aqui."
          action={<NewBillDialog categories={categories} />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {bills.map((item) => (
            <BillCard
              key={item.bill.id}
              data={item}
              categories={categories}
              referenceMonth={referenceMonth}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function BillCard({
  data,
  categories,
  referenceMonth,
}: {
  data: BillCardData
  categories: Category[]
  referenceMonth: string
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [editing, setEditing] = React.useState(false)
  const [toggling, setToggling] = React.useState(false)

  const category = categories.find((item) => item.id === data.bill.category_id)

  async function handleToggle(isPaid: boolean) {
    setToggling(true)
    const result = await toggleBillPayment({
      fixedBillId: data.bill.id,
      referenceMonth,
      isPaid,
    })
    setToggling(false)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível atualizar', description: result.error })
      return
    }

    router.refresh()
  }

  async function handleDelete() {
    const result = await deleteFixedBill(data.bill.id)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir', description: result.error })
      return
    }
    toast({ title: 'Conta excluída' })
    router.refresh()
  }

  if (editing) {
    return (
      <Card className="border-primary/40">
        <CardContent className="pt-5">
          <BillForm
            categories={categories}
            initial={data.bill}
            submitLabel="Salvar"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              const result = await updateFixedBill(data.bill.id, input)
              if (!result.ok) return result.error

              toast({ variant: 'success', title: 'Conta atualizada' })
              setEditing(false)
              router.refresh()
              return null
            }}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        'transition-colors',
        data.isOverdue && 'border-destructive/50',
        data.isDueSoon && 'border-amber-500/50',
      )}
    >
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: `${category?.color ?? '#94a3b8'}1f`,
              color: category?.color ?? '#94a3b8',
            }}
          >
            <CategoryIcon name={category?.icon} className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{data.bill.name}</p>
            <p className="text-xs text-muted-foreground">
              vence dia {data.bill.due_day}
              {category ? ` · ${category.name}` : ''}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Editar ${data.bill.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>

        <p className="tabular text-xl font-semibold tracking-tight">
          {formatCurrency(data.effectiveAmount)}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {data.isPaid ? (
            <Badge variant="success">
              <Check className="mr-1 h-3 w-3" />
              paga{data.payment?.paid_at ? ` em ${formatDate(data.payment.paid_at)}` : ''}
            </Badge>
          ) : data.isOverdue ? (
            <Badge variant="destructive">vencida em {formatDate(data.dueDate)}</Badge>
          ) : data.isDueSoon ? (
            <Badge variant="outline">vence {formatDate(data.dueDate)}</Badge>
          ) : (
            <Badge variant="secondary">em aberto</Badge>
          )}

          {data.bill.is_autopay ? <Badge variant="outline">débito automático</Badge> : null}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={data.isPaid}
              disabled={toggling}
              onCheckedChange={handleToggle}
              aria-label={`Marcar ${data.bill.name} como paga`}
            />
            <span className="text-muted-foreground">
              {toggling ? 'salvando…' : data.isPaid ? 'Pago' : 'Marcar como pago'}
            </span>
          </label>

          <ConfirmButton
            title={`Excluir “${data.bill.name}”?`}
            description="A conta e o histórico de pagamentos dela saem do sistema."
            confirmLabel="Excluir"
            onConfirm={handleDelete}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Excluir ${data.bill.name}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function NewBillDialog({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nova conta
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conta fixa</DialogTitle>
        </DialogHeader>

        <BillForm
          categories={categories}
          submitLabel="Adicionar"
          onCancel={() => setOpen(false)}
          onSubmit={async (input) => {
            const result = await createFixedBill(input)
            if (!result.ok) return result.error

            toast({ variant: 'success', title: 'Conta adicionada' })
            setOpen(false)
            router.refresh()
            return null
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

const NO_CATEGORY = '__sem__'

function BillForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  categories: Category[]
  initial?: FixedBill
  submitLabel: string
  onSubmit: (input: FixedBillInput) => Promise<string | null>
  onCancel: () => void
}) {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [amount, setAmount] = React.useState(
    initial ? String(initial.amount).replace('.', ',') : '',
  )
  const [dueDay, setDueDay] = React.useState(String(initial?.due_day ?? 10))
  const [categoryId, setCategoryId] = React.useState(initial?.category_id ?? NO_CATEGORY)
  const [isAutopay, setIsAutopay] = React.useState(initial?.is_autopay ?? false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const message = await onSubmit({
      name: name.trim(),
      amount: parseCurrencyInput(amount),
      due_day: Number(dueDay),
      category_id: categoryId === NO_CATEGORY ? null : categoryId,
      is_autopay: isAutopay,
      is_active: initial?.is_active ?? true,
      notes: initial?.notes ?? null,
    })

    if (message) setError(message)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bill-name">Nome</Label>
        <Input
          id="bill-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Escola dos meninos"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="bill-amount">Valor</Label>
          <Input
            id="bill-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="1.234,56"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bill-day">Dia do vencimento</Label>
          <Input
            id="bill-day"
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bill-category">Categoria</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="bill-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Switch checked={isAutopay} onCheckedChange={setIsAutopay} />
        Débito automático
      </label>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
