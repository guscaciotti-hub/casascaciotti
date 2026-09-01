'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, RefreshCw, Search, Store, Trash2 } from 'lucide-react'
import {
  createMerchant,
  createRule,
  deleteMerchant,
  deleteRule,
  reprocessUnidentified,
  updateMerchant,
  type MerchantInput,
} from '@/app/actions/merchants'
import { ConfirmButton } from '@/components/confirm-button'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useToast } from '@/components/ui/toast'
import { sortRules } from '@/lib/matcher'
import type { Category, MatchType, Merchant, MerchantRule } from '@/lib/types'

export interface MerchantWithRules {
  merchant: Merchant
  rules: MerchantRule[]
  transactionCount: number
}

const MATCH_LABELS: Record<MatchType, string> = {
  exact: 'exato',
  contains: 'contém',
  regex: 'regex',
}

export function MerchantsManager({
  merchants,
  categories,
}: {
  merchants: MerchantWithRules[]
  categories: Category[]
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [search, setSearch] = React.useState('')
  const [reprocessing, setReprocessing] = React.useState(false)

  const filtered = React.useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return merchants

    return merchants.filter((item) => {
      const haystack = [
        item.merchant.display_name,
        ...item.rules.map((rule) => rule.pattern),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [merchants, search])

  async function handleReprocess() {
    setReprocessing(true)
    const result = await reprocessUnidentified()
    setReprocessing(false)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Falha ao reprocessar', description: result.error })
      return
    }

    toast({
      variant: 'success',
      title:
        result.data.updated === 0
          ? 'Nada novo para classificar'
          : `${result.data.updated} lançamentos reclassificados`,
    })
    router.refresh()
  }

  if (merchants.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Nenhum estabelecimento cadastrado"
        description="Eles nascem sozinhos quando você rotula um lançamento na tela de revisão — ou cadastre um aqui."
        action={<NewMerchantDialog categories={categories} />}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou padrão"
            className="pl-9"
            aria-label="Buscar estabelecimentos"
          />
        </div>

        <Button variant="outline" onClick={handleReprocess} disabled={reprocessing}>
          {reprocessing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reprocessar não identificados
        </Button>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <MerchantCard key={item.merchant.id} data={item} categories={categories} />
        ))}
      </div>
    </div>
  )
}

function MerchantCard({
  data,
  categories,
}: {
  data: MerchantWithRules
  categories: Category[]
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [name, setName] = React.useState(data.merchant.display_name)
  const [categoryId, setCategoryId] = React.useState(data.merchant.category_id ?? '')
  const [reprocessHistory, setReprocessHistory] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const dirty =
    name !== data.merchant.display_name || categoryId !== (data.merchant.category_id ?? '')
  const categoryChanged = categoryId !== (data.merchant.category_id ?? '')
  const ordered = React.useMemo(() => sortRules(data.rules), [data.rules])

  async function handleSave() {
    if (!categoryId) {
      toast({ variant: 'error', title: 'Escolha uma categoria.' })
      return
    }

    setSaving(true)
    const result = await updateMerchant(
      data.merchant.id,
      { display_name: name.trim(), category_id: categoryId, notes: data.merchant.notes },
      { reprocessHistory: categoryChanged && reprocessHistory },
    )
    setSaving(false)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível salvar', description: result.error })
      return
    }

    toast({
      variant: 'success',
      title: 'Estabelecimento atualizado',
      description:
        result.data.reprocessed > 0
          ? `${result.data.reprocessed} lançamentos do histórico acompanharam a mudança.`
          : undefined,
    })
    router.refresh()
  }

  async function handleDelete() {
    const result = await deleteMerchant(data.merchant.id)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir', description: result.error })
      return
    }
    toast({ title: 'Estabelecimento excluído' })
    router.refresh()
  }

  async function handleDeleteRule(ruleId: string) {
    const result = await deleteRule(ruleId)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível excluir a regra', description: result.error })
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${data.merchant.id}`} className="text-xs text-muted-foreground">
              Nome amigável
            </Label>
            <Input
              id={`name-${data.merchant.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor={`category-${data.merchant.id}`}
              className="text-xs text-muted-foreground"
            >
              Categoria
            </Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id={`category-${data.merchant.id}`}>
                <SelectValue placeholder="Escolher" />
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

        {categoryChanged ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-muted/50 p-3 text-xs leading-snug">
            <Checkbox
              checked={reprocessHistory}
              onCheckedChange={(checked) => setReprocessHistory(checked === true)}
              className="mt-0.5"
            />
            <span>
              Reprocessar o histórico: aplicar a categoria nova aos{' '}
              <span className="font-medium">{data.transactionCount}</span> lançamentos já
              classificados como {data.merchant.display_name}
            </span>
          </label>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Padrões de correspondência ({ordered.length}) — avaliados de cima para baixo
          </p>

          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum padrão. Sem pelo menos um, este estabelecimento não é reconhecido
              automaticamente.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {ordered.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Badge variant="outline" className="shrink-0">
                    {MATCH_LABELS[rule.match_type]}
                  </Badge>
                  <code className="min-w-0 flex-1 truncate text-xs">{rule.pattern}</code>
                  {!rule.active ? (
                    <Badge variant="secondary" className="shrink-0">
                      inativa
                    </Badge>
                  ) : null}

                  <ConfirmButton
                    title="Excluir este padrão?"
                    description={`Lançamentos futuros que casavam com “${rule.pattern}” voltam para a fila de revisão.`}
                    confirmLabel="Excluir padrão"
                    onConfirm={() => handleDeleteRule(rule.id)}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label="Excluir padrão">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          <NewRuleDialog merchantId={data.merchant.id} merchantName={data.merchant.display_name} />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {data.transactionCount}{' '}
            {data.transactionCount === 1 ? 'lançamento' : 'lançamentos'} no histórico
          </p>

          <div className="flex items-center gap-2">
            <ConfirmButton
              title={`Excluir “${data.merchant.display_name}”?`}
              description="Os padrões dele saem junto e os lançamentos voltam para a fila de revisão. O histórico não é apagado."
              confirmLabel="Excluir"
              onConfirm={handleDelete}
              trigger={
                <Button variant="ghost" size="icon" aria-label="Excluir estabelecimento">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              }
            />

            <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function NewRuleDialog({
  merchantId,
  merchantName,
}: {
  merchantId: string
  merchantName: string
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = React.useState(false)
  const [pattern, setPattern] = React.useState('')
  const [matchType, setMatchType] = React.useState<MatchType>('contains')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const result = await createRule(
      { merchant_id: merchantId, pattern: pattern.trim(), match_type: matchType, priority: 100, active: true },
      { reprocessHistory: true },
    )

    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      variant: 'success',
      title: 'Padrão adicionado',
      description:
        result.data.reprocessed > 0
          ? `${result.data.reprocessed} lançamentos do histórico foram classificados.`
          : undefined,
    })

    setPattern('')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" />
          Adicionar padrão
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo padrão — {merchantName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-pattern">Padrão</Label>
            <Input
              id="rule-pattern"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="PASQUALI"
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Comparado com a descrição já normalizada (sem acento, em maiúsculas).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-type">Tipo</Label>
            <Select value={matchType} onValueChange={(value) => setMatchType(value as MatchType)}>
              <SelectTrigger id="rule-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">Exato — a descrição inteira</SelectItem>
                <SelectItem value="contains">Contém — em qualquer posição</SelectItem>
                <SelectItem value="regex">Regex — expressão regular</SelectItem>
              </SelectContent>
            </Select>
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NewMerchantDialog({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const { toast } = useToast()

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const input: MerchantInput = {
      display_name: name.trim(),
      category_id: categoryId,
      notes: null,
    }

    const result = await createMerchant(input)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({ variant: 'success', title: 'Estabelecimento criado' })
    setName('')
    setCategoryId('')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Novo estabelecimento
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo estabelecimento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Nome amigável</Label>
            <Input
              id="merchant-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Escola dos meninos"
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="merchant-category">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="merchant-category">
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
