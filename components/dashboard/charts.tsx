'use client'

import * as React from 'react'
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency, formatCurrencyCompact, formatMonthShort } from '@/lib/format'

interface CategorySlice {
  name: string
  color: string
  total: number
}

/** Rosca de gasto por categoria no mês. */
export function CategoryDonut({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.total, 0)

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Nenhum gasto lançado neste mês.
      </div>
    )
  }

  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="total"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={1.5}
            stroke="none"
          >
            {data.map((slice) => (
              <Cell key={slice.name} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Total do mês</span>
        <span className="tabular text-lg font-semibold">{formatCurrency(total)}</span>
      </div>
    </div>
  )
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; payload?: CategorySlice }>
  total: number
}) {
  if (!active || !payload?.length) return null

  const slice = payload[0]
  const value = Number(slice.value ?? 0)
  const share = total > 0 ? (value / total) * 100 : 0

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium">{slice.payload?.name ?? slice.name}</p>
      <p className="tabular text-sm">{formatCurrency(value)}</p>
      <p className="text-xs text-muted-foreground">{share.toFixed(1)}% do mês</p>
    </div>
  )
}

/** Linha de evolução do gasto total nos últimos 12 meses. */
export function MonthlyTrend({ data }: { data: Array<{ month: string; total: number }> }) {
  const chartData = data.map((point) => ({ ...point, label: formatMonthShort(point.month) }))
  const hasData = chartData.some((point) => point.total > 0)

  if (!hasData) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        Ainda não há histórico suficiente.
      </div>
    )
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value: number) => formatCurrencyCompact(value)}
          />
          <Tooltip content={<TrendTooltip />} />
          <Line
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-sm font-medium">{formatCurrency(Number(payload[0].value ?? 0))}</p>
    </div>
  )
}

/** Linha de evolução do saldo total guardado. */
export function SavingsTrend({ data }: { data: Array<{ date: string; balance: number }> }) {
  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        Atualize o saldo pelo menos duas vezes para ver a evolução.
      </div>
    )
  }

  const chartData = data.map((point) => ({
    ...point,
    label: point.date.slice(8, 10) + '/' + point.date.slice(5, 7),
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value: number) => formatCurrencyCompact(value)}
          />
          <Tooltip content={<TrendTooltip />} />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
