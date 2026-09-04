'use client'

/**
 * Sininho de recados.
 *
 * Duas coisas chamam atenção aqui, e elas não são a mesma: mensagem não lida,
 * que some quando a pessoa abre a conversa, e pedido em aberto, que continua
 * cobrando até alguém atender. Ler não é atender.
 *
 * Ele se atualiza sozinho por uma rota própria, e não recarregando a página:
 * um `router.refresh()` a cada 30 segundos apagaria o que estivesse sendo
 * digitado na planilha de contas.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, HandHelping } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Inbox } from '@/lib/types'

const POLL_MS = 30_000

export function NotificationBell({ initial }: { initial: Inbox }) {
  const pathname = usePathname()
  const [inbox, setInbox] = React.useState(initial)
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch('/api/inbox', { cache: 'no-store' })
      if (!response.ok) return
      setInbox(await response.json())
    } catch {
      // Rede caiu: o sininho fica com o que tinha em vez de zerar.
    }
  }, [])

  React.useEffect(() => setInbox(initial), [initial])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  // Ao sair da tela de recados, a contagem de não lidos mudou no servidor.
  React.useEffect(() => {
    void refresh()
    setOpen(false)
  }, [pathname, refresh])

  React.useEffect(() => {
    if (!open) return

    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pending = inbox.pendingRequests.length
  const count = inbox.unread + pending

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={
          count > 0 ? `Recados: ${count} para ver` : 'Recados'
        }
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
              // Pedido em aberto é mais urgente que mensagem não lida.
              pending > 0 ? 'bg-amber-500' : 'bg-primary',
            )}
          >
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-sm font-medium">Recados</p>
            <p className="text-xs text-muted-foreground">
              {count === 0
                ? 'Nada esperando por você.'
                : [
                    inbox.unread > 0 ? `${inbox.unread} não lido${inbox.unread > 1 ? 's' : ''}` : null,
                    pending > 0 ? `${pending} pedido${pending > 1 ? 's' : ''} em aberto` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {inbox.pendingRequests.length > 0 ? (
              <div className="border-b border-border">
                {inbox.pendingRequests.slice(0, 5).map((message) => (
                  <div key={message.id} className="flex gap-2 px-4 py-2.5">
                    <HandHelping className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{message.author_name} pediu</p>
                      <p className="break-words text-sm">{message.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {inbox.recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                A conversa ainda está vazia.
              </p>
            ) : (
              inbox.recent.slice(0, 5).map((message) => (
                <div key={message.id} className="px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    {message.author_name} · {formatWhen(message.created_at)}
                  </p>
                  <p className="line-clamp-2 break-words text-sm">{message.body}</p>
                </div>
              ))
            )}
          </div>

          <Link
            href="/recados"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium hover:bg-accent"
          >
            Abrir a conversa
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
