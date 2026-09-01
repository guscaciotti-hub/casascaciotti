'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, PiggyBank, Plus, Trash2, Wallet } from 'lucide-react'
import {
  createSavingsAccount,
  deleteSavingsAccount,
  updateBalance,
  updateSavingsAccount,
  type SavingsAccountInput,
} from '@/app/actions/savings'
import { ConfirmButton } from '@/components/confirm-button'
import { EmptyState } from '@/components/empty-state'
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
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate, formatPercent, parseCurrencyInput } from '@/lib/format'
import type { SavingsAccount } from '@/lib/types'

export function SavingsGrid({ accounts }: { accounts: SavingsAccount[] }) {
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Nenhuma reserva cadastrada"
        description="Reserva de emergência, poupança das crianças, viagem — cadastre e acompanhe a evolução."
        action={<NewAccountDialog />}
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => (
        <AccountCard key={account.id} account={account} />
      ))}
    </div>
  )
}

function AccountCard({ account }: { account: SavingsAccount }) {
  const router = useRouter()
  const { toast } = useToast()

  const [editing, setEditing] = React.useState(false)
  const goal = account.goal_amount ? Number(account.goal_amount) : null
  const balance = Number(account.current_balance)
  const progress = goal && goal > 0 ? Math.min(100, (balance / goal) * 100) : null

  async function handleDelete() {
    const result = await deleteSavingsAccount(account.id)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir', description: result.error })
      return
    }
    toast({ title: 'Reserva excluída' })
    router.refresh()
  }

  if (editing) {
    return (
      <Card className="border-primary/40">
        <CardContent className="pt-5">
          <AccountForm
            initial={account}
            submitLabel="Salvar"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              const result = await updateSavingsAccount(account.id, input)
              if (!result.ok) return result.error

              toast({ variant: 'success', title: 'Reserva atualizada' })
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
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
            <Wallet className="h-4 w-4" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{account.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {account.institution || 'Sem instituição'} · atualizado em{' '}
              {formatDate(account.updated_at)}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Editar ${account.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>

        <p className="tabular text-2xl font-semibold tracking-tight">{formatCurrency(balance)}</p>

        {goal ? (
          <div className="space-y-1.5">
            <Progress value={progress ?? 0} indicatorClassName="bg-success" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatPercent((progress ?? 0) / 100)} da meta</span>
              <span className="tabular">{formatCurrency(goal)}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <UpdateBalanceDialog account={account} />

          <ConfirmButton
            title={`Excluir “${account.name}”?`}
            description="A reserva e todo o histórico de saldos dela saem do sistema."
            confirmLabel="Excluir"
            onConfirm={handleDelete}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Excluir ${account.name}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

function UpdateBalanceDialog({ account }: { account: SavingsAccount }) {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setValue(String(account.current_balance).replace('.', ','))
      setError(null)
    }
  }, [open, account.current_balance])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const result = await updateBalance({
      accountId: account.id,
      balance: parseCurrencyInput(value),
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({ variant: 'success', title: 'Saldo atualizado' })
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Atualizar saldo
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar saldo — {account.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`balance-${account.id}`}>Saldo atual</Label>
            <Input
              id={`balance-${account.id}`}
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="12.500,00"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Cada atualização vira um ponto no gráfico de evolução.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewAccountDialog() {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nova reserva
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova reserva</DialogTitle>
        </DialogHeader>

        <AccountForm
          submitLabel="Adicionar"
          onCancel={() => setOpen(false)}
          onSubmit={async (input) => {
            const result = await createSavingsAccount(input)
            if (!result.ok) return result.error

            toast({ variant: 'success', title: 'Reserva criada' })
            setOpen(false)
            router.refresh()
            return null
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AccountForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: SavingsAccount
  submitLabel: string
  onSubmit: (input: SavingsAccountInput) => Promise<string | null>
  onCancel: () => void
}) {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [institution, setInstitution] = React.useState(initial?.institution ?? '')
  const [goal, setGoal] = React.useState(
    initial?.goal_amount ? String(initial.goal_amount).replace('.', ',') : '',
  )
  const [balance, setBalance] = React.useState(
    initial ? String(initial.current_balance).replace('.', ',') : '',
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const message = await onSubmit({
      name: name.trim(),
      institution: institution.trim() || null,
      goal_amount: goal.trim() ? parseCurrencyInput(goal) : null,
      current_balance: parseCurrencyInput(balance),
    })

    if (message) setError(message)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="savings-name">Nome</Label>
        <Input
          id="savings-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Reserva de emergência"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="savings-institution">Instituição</Label>
        <Input
          id="savings-institution"
          value={institution}
          onChange={(event) => setInstitution(event.target.value)}
          placeholder="Ex.: Nubank"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="savings-balance">Saldo atual</Label>
          <Input
            id="savings-balance"
            inputMode="decimal"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            placeholder="0,00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="savings-goal">Meta (opcional)</Label>
          <Input
            id="savings-goal"
            inputMode="decimal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="30.000,00"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
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
