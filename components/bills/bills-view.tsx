'use client'

/**
 * Alterna entre a planilha e os cartões.
 *
 * A planilha vem por padrão: é o formato que a casa usa há anos e o que a
 * Renata domina. Os cartões continuam a um clique porque leem melhor no
 * celular e mostram juros e categoria, que não cabem numa linha.
 *
 * A escolha fica no navegador de cada um — o Gustavo pode preferir cartões
 * sem tirar a planilha dela.
 */

import * as React from 'react'
import { LayoutGrid, Table2 } from 'lucide-react'
import { BillsGrid, type BillCardData } from '@/components/bills/bills-grid'
import { BillsSheet } from '@/components/bills/bills-sheet'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/types'

const STORAGE_KEY = 'casascaciotti:contas:view'
type View = 'planilha' | 'cartoes'

export function BillsView({
  bills,
  categories,
  referenceMonth,
}: {
  bills: BillCardData[]
  categories: Category[]
  referenceMonth: string
}) {
  const [view, setView] = React.useState<View>('planilha')

  // Lê a preferência só depois de montar: o servidor não conhece o
  // localStorage, e ler antes trocaria o HTML durante a hidratação.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === 'planilha' || saved === 'cartoes') setView(saved)
    } catch {
      // Navegador com storage bloqueado: fica no padrão.
    }
  }, [])

  function choose(next: View) {
    setView(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Sem persistir, mas a troca vale para esta visita.
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Formato da lista de contas"
        className="inline-flex rounded-md border border-border p-0.5"
      >
        <ViewTab
          active={view === 'planilha'}
          onClick={() => choose('planilha')}
          icon={<Table2 className="h-4 w-4" />}
          label="Planilha"
        />
        <ViewTab
          active={view === 'cartoes'}
          onClick={() => choose('cartoes')}
          icon={<LayoutGrid className="h-4 w-4" />}
          label="Cartões"
        />
      </div>

      {view === 'planilha' ? (
        <BillsSheet bills={bills} referenceMonth={referenceMonth} />
      ) : (
        <BillsGrid bills={bills} categories={categories} referenceMonth={referenceMonth} />
      )}
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
