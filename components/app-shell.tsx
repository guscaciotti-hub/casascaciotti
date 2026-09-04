'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  PiggyBank,
  Receipt,
  Store,
  Tags,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import type { Inbox } from '@/lib/types'

const NAV_ITEMS = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/faturas', label: 'Faturas', icon: CreditCard },
  { href: '/contas-fixas', label: 'Contas', icon: Receipt },
  { href: '/reserva', label: 'Reserva', icon: PiggyBank },
  { href: '/recados', label: 'Recados', icon: MessageCircle },
]

const SECONDARY_ITEMS = [
  { href: '/estabelecimentos', label: 'Estabelecimentos', icon: Store },
  { href: '/categorias', label: 'Categorias', icon: Tags },
]

export function AppShell({
  username,
  inbox,
  nickname,
  children,
}: {
  username: string
  inbox: Inbox
  /** Como esta pessoa chama a outra. Sem apelido, sem balãozinho. */
  nickname: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <div className="min-h-dvh lg:flex">
      {/* Navegação lateral — desktop */}
      <aside className="hidden w-60 shrink-0 border-r border-border lg:flex lg:flex-col">
        <div className="px-6 py-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Casa Scaciotti
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {[...NAV_ITEMS, ...SECONDARY_ITEMS].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive(item.href)
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border px-6 py-4">
          <p className="truncate text-xs text-muted-foreground">{username}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho — o sininho fica aqui em cima, em qualquer tela. */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
          {/* No desktop a marca já está na barra lateral; aqui só no celular. */}
          <Link href="/" className="text-sm font-semibold tracking-tight lg:hidden">
            Casa Scaciotti
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell initial={inbox} username={username} nickname={nickname} />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 pb-24 lg:pb-10">{children}</main>

        {/* Navegação inferior — mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors',
                  isActive(item.href) ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      </div>
    </div>
  )
}

function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
        <LogOut className="h-4 w-4" />
      </Button>
    </form>
  )
}
