'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from '@/app/actions/categories'
import { CATEGORY_ICON_NAMES, CategoryIcon } from '@/components/category-icon'
import { ConfirmButton } from '@/components/confirm-button'
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
import { formatCurrency, parseCurrencyInput } from '@/lib/format'
import { UNCATEGORIZED, type Category } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CategoriesManager({ categories }: { categories: Category[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </div>
  )
}

function CategoryCard({ category }: { category: Category }) {
  const router = useRouter()
  const { toast } = useToast()

  const [editing, setEditing] = React.useState(false)
  const isProtected = category.name === UNCATEGORIZED

  async function handleDelete() {
    const result = await deleteCategory(category.id)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir', description: result.error })
      return
    }
    toast({ title: 'Categoria excluída' })
    router.refresh()
  }

  if (editing) {
    return (
      <Card className="border-primary/40">
        <CardContent className="pt-5">
          <CategoryForm
            initial={category}
            submitLabel="Salvar"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              const result = await updateCategory(category.id, input)
              if (!result.ok) return result.error

              toast({ variant: 'success', title: 'Categoria atualizada' })
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
      <CardContent className="flex items-start gap-3 pt-5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${category.color}1f`, color: category.color }}
        >
          <CategoryIcon name={category.icon} className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{category.name}</p>
          <p className="text-xs text-muted-foreground">
            {category.monthly_budget
              ? `Orçamento ${formatCurrency(category.monthly_budget)}/mês`
              : 'Sem orçamento definido'}
          </p>
          {category.is_essential ? (
            <Badge variant="secondary" className="mt-2">
              essencial
            </Badge>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Editar ${category.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {!isProtected ? (
            <ConfirmButton
              title={`Excluir “${category.name}”?`}
              description="Os lançamentos dessa categoria ficam sem categoria e voltam para a fila de revisão."
              confirmLabel="Excluir"
              onConfirm={handleDelete}
              trigger={
                <Button variant="ghost" size="icon" aria-label={`Excluir ${category.name}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function NewCategoryDialog() {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Nova categoria
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
        </DialogHeader>

        <CategoryForm
          submitLabel="Criar"
          onCancel={() => setOpen(false)}
          onSubmit={async (input) => {
            const result = await createCategory(input)
            if (!result.ok) return result.error

            toast({ variant: 'success', title: 'Categoria criada' })
            setOpen(false)
            router.refresh()
            return null
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

const PALETTE = [
  '#2563eb', '#16a34a', '#ea580c', '#0891b2', '#0d9488', '#7c3aed',
  '#db2777', '#65a30d', '#c026d3', '#f59e0b', '#b45309', '#475569', '#94a3b8',
]

function CategoryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Category
  submitLabel: string
  onSubmit: (input: CategoryInput) => Promise<string | null>
  onCancel: () => void
}) {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [color, setColor] = React.useState(initial?.color ?? PALETTE[0])
  const [icon, setIcon] = React.useState(initial?.icon ?? 'circle-help')
  const [budget, setBudget] = React.useState(
    initial?.monthly_budget ? String(initial.monthly_budget).replace('.', ',') : '',
  )
  const [isEssential, setIsEssential] = React.useState(initial?.is_essential ?? false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const message = await onSubmit({
      name: name.trim(),
      color,
      icon,
      monthly_budget: budget.trim() ? parseCurrencyInput(budget) : null,
      is_essential: isEssential,
    })

    if (message) setError(message)
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="category-name">Nome</Label>
        <Input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColor(option)}
              aria-label={`Usar a cor ${option}`}
              aria-pressed={color === option}
              className={cn(
                'h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-shadow',
                color === option && 'ring-2 ring-foreground',
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category-icon">Ícone</Label>
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <CategoryIcon name={icon} className="h-5 w-5" />
          </span>

          <Select value={icon} onValueChange={setIcon}>
            <SelectTrigger id="category-icon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ICON_NAMES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category-budget">Orçamento mensal (opcional)</Label>
        <Input
          id="category-budget"
          inputMode="decimal"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          placeholder="1.500,00"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Switch checked={isEssential} onCheckedChange={setIsEssential} />
        Gasto essencial
      </label>

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
