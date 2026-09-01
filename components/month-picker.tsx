'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, formatMonthLabel, toReferenceMonth } from '@/lib/format'
import { Button } from '@/components/ui/button'

/**
 * Seletor de mês. O mês vive na URL (`?mes=2026-03-01`) para que a página
 * continue sendo Server Component e o estado sobreviva a um refresh.
 */
export function MonthPicker({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = React.useTransition()

  const go = (month: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', month)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const isCurrentMonth = value === toReferenceMonth()

  return (
    <div className="flex items-center gap-1" data-pending={pending || undefined}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mês anterior"
        onClick={() => go(addMonths(value, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <button
        type="button"
        onClick={() => go(toReferenceMonth())}
        className="min-w-[9.5rem] rounded-md px-2 py-1.5 text-sm font-medium tracking-tight transition-colors hover:bg-accent"
        title={isCurrentMonth ? undefined : 'Voltar para o mês atual'}
      >
        {formatMonthLabel(value)}
      </button>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Próximo mês"
        onClick={() => go(addMonths(value, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
