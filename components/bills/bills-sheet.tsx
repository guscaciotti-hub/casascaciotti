'use client'

/**
 * Planilha de contas.
 *
 * Reproduz a planilha compartilhada que a casa usa há anos — mesmas colunas,
 * mesma ordem, mesma mecânica: clica na célula, digita, Tab ou Enter vai para a
 * próxima, a caixinha de Status marca o que já foi pago, e o TOTAL fecha
 * embaixo. Quem já domina a planilha não deveria ter que reaprender nada.
 *
 * Por isso não há formulário aqui. Cada célula salva sozinha ao sair dela,
 * como numa planilha de verdade: o valor aparece na hora (otimista) e o
 * servidor confirma depois. Se falhar, a célula volta ao que era e aparece um
 * aviso — o contrário, um valor errado que parece salvo, é bem pior.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react'
import {
  createBillRow,
  deleteFixedBill,
  moveBillRow,
  saveBillRow,
  type BillSheetPatch,
} from '@/app/actions/bills'
import { ConfirmButton } from '@/components/confirm-button'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, parseCurrencyInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BillCardData } from '@/components/bills/bills-grid'

/** As pessoas da casa, para a coluna "Quem?" não virar digitação livre toda vez. */
const PEOPLE = ['Gustavo', 'Renata']

/** Colunas na ordem da planilha. O índice é usado na navegação por teclado. */
const COLUMNS = [
  'Tipo',
  'Valor',
  'Parcela',
  'Vencimento',
  'Status',
  'Quem?',
  'Pago em:',
  'Observações',
] as const

export function BillsSheet({
  bills,
  referenceMonth,
}: {
  bills: BillCardData[]
  referenceMonth: string
}) {
  const total = bills.reduce((sum, item) => sum + item.effectiveAmount, 0)
  const paidTotal = bills
    .filter((item) => item.isPaid)
    .reduce((sum, item) => sum + item.effectiveAmount, 0)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {COLUMNS.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap border-r border-border px-3 py-2 font-semibold',
                    // "Tipo" acompanha a rolagem horizontal: numa planilha larga,
                    // perder de vista de que conta é a linha inutiliza o resto.
                    index === 0 && 'sticky left-0 z-10 bg-muted text-left',
                    index > 0 && 'text-center',
                  )}
                >
                  {column}
                </th>
              ))}
              <th scope="col" className="w-24 px-2 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {bills.map((item, index) => (
              <SheetRow
                key={item.bill.id}
                data={item}
                rowIndex={index}
                isFirst={index === 0}
                isLast={index === bills.length - 1}
                referenceMonth={referenceMonth}
              />
            ))}

            <NewRow rowIndex={bills.length} />
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50 font-semibold">
              <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">
                TOTAL:
              </th>
              <td className="tabular border-r border-border px-3 py-2 text-right">
                {formatCurrency(total)}
              </td>
              <td colSpan={COLUMNS.length - 2 + 1} className="px-3 py-2 text-xs font-normal text-muted-foreground">
                {formatCurrency(paidTotal)} já pago · {formatCurrency(total - paidTotal)} em aberto
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Clique numa célula para editar. <kbd>Enter</kbd> desce, <kbd>Tab</kbd> anda para o lado,
        <kbd> Esc</kbd> desfaz. Cada célula salva sozinha ao sair dela.
      </p>
    </div>
  )
}

function SheetRow({
  data,
  rowIndex,
  isFirst,
  isLast,
  referenceMonth,
}: {
  data: BillCardData
  rowIndex: number
  isFirst: boolean
  isLast: boolean
  referenceMonth: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = React.useState(false)
  const [moving, setMoving] = React.useState(false)

  const payment = data.payment

  /** Salva um patch da linha. Devolve `false` para a célula reverter sozinha. */
  const save = React.useCallback(
    async (patch: BillSheetPatch): Promise<boolean> => {
      setSaving(true)
      const result = await saveBillRow(data.bill.id, referenceMonth, patch)
      setSaving(false)

      if (!result.ok) {
        toast({ variant: 'error', title: 'Não salvou', description: result.error })
        return false
      }

      router.refresh()
      return true
    },
    [data.bill.id, referenceMonth, router, toast],
  )

  async function handleMove(direction: 'up' | 'down') {
    setMoving(true)
    const result = await moveBillRow(data.bill.id, direction)
    setMoving(false)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível mover', description: result.error })
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
    toast({ title: 'Linha excluída' })
    router.refresh()
  }

  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-accent/30',
        data.isPaid && 'text-muted-foreground',
        // Vencida sem estar paga: o mesmo destaque que ela dá na mão, com cor.
        !data.isPaid && data.isOverdue && 'bg-destructive/5',
      )}
    >
      <TextCell
        value={data.bill.name}
        onSave={(value) => save({ name: value })}
        rowIndex={rowIndex}
        colIndex={0}
        align="left"
        sticky
        required
        label={`Tipo da linha ${rowIndex + 1}`}
      />

      <CurrencyCell
        value={payment?.amount_paid ?? payment?.amount_due ?? null}
        fallback={Number(data.bill.amount) || null}
        onSave={(value) => save({ amount_due: value })}
        rowIndex={rowIndex}
        colIndex={1}
        label={`Valor de ${data.bill.name}`}
      />

      <TextCell
        value={payment?.installment ?? ''}
        onSave={(value) => save({ installment: value || null })}
        rowIndex={rowIndex}
        colIndex={2}
        align="center"
        label={`Parcela de ${data.bill.name}`}
      />

      <DateCell
        value={payment?.due_date ?? null}
        onSave={(value) => save({ due_date: value })}
        rowIndex={rowIndex}
        colIndex={3}
        label={`Vencimento de ${data.bill.name}`}
      />

      <td className="border-r border-border px-3 py-1 text-center">
        <input
          type="checkbox"
          checked={data.isPaid}
          onChange={(event) => save({ is_paid: event.target.checked })}
          data-cell={`${rowIndex}-4`}
          onKeyDown={moveOnKey}
          aria-label={`${data.bill.name} paga`}
          className="h-4 w-4 cursor-pointer accent-emerald-600"
        />
      </td>

      <TextCell
        value={payment?.paid_by ?? ''}
        onSave={(value) => save({ paid_by: value || null })}
        rowIndex={rowIndex}
        colIndex={5}
        align="center"
        options={PEOPLE}
        label={`Quem paga ${data.bill.name}`}
      />

      <DateCell
        value={payment?.paid_on ?? null}
        onSave={(value) => save({ paid_on: value })}
        rowIndex={rowIndex}
        colIndex={6}
        label={`${data.bill.name} paga em`}
      />

      <TextCell
        value={payment?.notes ?? ''}
        onSave={(value) => save({ notes: value || null })}
        rowIndex={rowIndex}
        colIndex={7}
        align="left"
        label={`Observações de ${data.bill.name}`}
      />

      <td className="px-1 py-1">
        <div className="flex items-center justify-end gap-0.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={isFirst || moving}
            onClick={() => handleMove('up')}
            aria-label={`Subir ${data.bill.name}`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={isLast || moving}
            onClick={() => handleMove('down')}
            aria-label={`Descer ${data.bill.name}`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>

          <ConfirmButton
            title={`Excluir “${data.bill.name}”?`}
            description="A linha sai da planilha em todos os meses, junto com o histórico de pagamentos dela."
            confirmLabel="Excluir"
            onConfirm={handleDelete}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Excluir ${data.bill.name}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            }
          />
        </div>
      </td>
    </tr>
  )
}

/**
 * Linha em branco no fim, como a primeira célula vazia de uma planilha:
 * digitar um nome ali cria a conta.
 */
function NewRow({ rowIndex }: { rowIndex: number }) {
  const router = useRouter()
  const { toast } = useToast()
  const [name, setName] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  async function commit() {
    const clean = name.trim()
    if (!clean) return

    setSaving(true)
    const result = await createBillRow(clean)
    setSaving(false)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível criar', description: result.error })
      return
    }

    setName('')
    router.refresh()
  }

  return (
    <tr className="border-b border-border">
      <td className="sticky left-0 z-10 border-r border-border bg-card px-1 py-1">
        <div className="flex items-center gap-1">
          <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={name}
            data-cell={`${rowIndex}-0`}
            onChange={(event) => setName(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') setName('')
            }}
            placeholder="Nova conta…"
            aria-label="Nova conta"
            className="w-full bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
          />
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
      </td>
      <td colSpan={COLUMNS.length} className="px-3 py-1 text-xs text-muted-foreground">
        digite o nome e tecle Enter
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Células
// ---------------------------------------------------------------------------

/** Enter e setas andam pela coluna, como numa planilha. */
function moveOnKey(event: React.KeyboardEvent<HTMLInputElement>) {
  const key = event.key
  if (key !== 'Enter' && key !== 'ArrowDown' && key !== 'ArrowUp') return

  const cell = event.currentTarget.dataset.cell
  if (!cell) return

  const [row, col] = cell.split('-').map(Number)
  const target = key === 'ArrowUp' ? row - 1 : row + 1
  const next = document.querySelector<HTMLElement>(`[data-cell="${target}-${col}"]`)

  event.preventDefault()
  // Sem próxima linha, Enter apenas confirma a célula atual.
  if (next) next.focus()
  else event.currentTarget.blur()
}

const CELL_INPUT =
  'w-full bg-transparent px-1 py-1 text-sm outline-none focus:bg-background focus:ring-1 focus:ring-primary'

function TextCell({
  value,
  onSave,
  rowIndex,
  colIndex,
  align,
  sticky,
  required,
  options,
  label,
}: {
  value: string
  onSave: (value: string) => Promise<boolean>
  rowIndex: number
  colIndex: number
  align: 'left' | 'center'
  sticky?: boolean
  required?: boolean
  options?: string[]
  label: string
}) {
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => setDraft(value), [value])

  const listId = options ? `cell-options-${colIndex}` : undefined

  async function commit() {
    const clean = draft.trim()
    if (clean === value.trim()) return
    // Nome vazio apagaria a identidade da linha: a saída é excluir, não limpar.
    if (required && !clean) {
      setDraft(value)
      return
    }
    if (!(await onSave(clean))) setDraft(value)
  }

  return (
    <td
      className={cn(
        'border-r border-border px-2 py-1',
        sticky && 'sticky left-0 z-10 bg-card',
      )}
    >
      <input
        value={draft}
        data-cell={`${rowIndex}-${colIndex}`}
        list={listId}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(value)
            event.currentTarget.blur()
            return
          }
          moveOnKey(event)
        }}
        aria-label={label}
        className={cn(CELL_INPUT, align === 'center' && 'text-center')}
      />
      {options ? (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </td>
  )
}

/**
 * Célula de dinheiro. Mostra `R$ 1.234,56` parada e o número cru em edição —
 * digitar por cima de máscara é o jeito mais rápido de errar um valor.
 */
function CurrencyCell({
  value,
  fallback,
  onSave,
  rowIndex,
  colIndex,
  label,
}: {
  value: number | null
  fallback: number | null
  onSave: (value: number | null) => Promise<boolean>
  rowIndex: number
  colIndex: number
  label: string
}) {
  const effective = value ?? fallback
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')

  const display = effective === null ? '' : formatCurrency(effective)

  async function commit() {
    setEditing(false)
    const clean = draft.trim()
    const next = clean === '' ? null : parseCurrencyInput(clean)

    if (next === (value ?? null)) return
    if (next !== null && next < 0) return
    await onSave(next)
  }

  return (
    <td className="border-r border-border px-2 py-1">
      <input
        inputMode="decimal"
        value={editing ? draft : display}
        data-cell={`${rowIndex}-${colIndex}`}
        onFocus={() => {
          setEditing(true)
          setDraft(effective === null ? '' : String(effective).replace('.', ','))
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setEditing(false)
            event.currentTarget.blur()
            return
          }
          moveOnKey(event)
        }}
        aria-label={label}
        className={cn(CELL_INPUT, 'tabular text-right')}
      />
    </td>
  )
}

function DateCell({
  value,
  onSave,
  rowIndex,
  colIndex,
  label,
}: {
  value: string | null
  onSave: (value: string | null) => Promise<boolean>
  rowIndex: number
  colIndex: number
  label: string
}) {
  const [draft, setDraft] = React.useState(value ?? '')
  React.useEffect(() => setDraft(value ?? ''), [value])

  async function commit(next: string) {
    if (next === (value ?? '')) return
    if (!(await onSave(next || null))) setDraft(value ?? '')
  }

  return (
    <td className="border-r border-border px-2 py-1">
      <input
        type="date"
        value={draft}
        data-cell={`${rowIndex}-${colIndex}`}
        onChange={(event) => {
          setDraft(event.target.value)
          // O seletor nativo fecha sem disparar blur no mobile: salva na hora.
          void commit(event.target.value)
        }}
        onKeyDown={moveOnKey}
        aria-label={label}
        className={cn(CELL_INPUT, 'text-center')}
      />
    </td>
  )
}
