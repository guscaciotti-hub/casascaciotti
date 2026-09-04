'use client'

/**
 * Recados da casa.
 *
 * Uma conversa só, entre duas pessoas. Não há salas nem destinatário: toda
 * mensagem é para a outra pessoa, e inventar caixa de entrada aqui seria
 * estrutura sem uso.
 *
 * A distinção que importa é outra: recado x pedido. "Paguei a luz" se lê e
 * acabou; "me manda a fatura do Nubank" fica pendente até alguém atender. É o
 * pedido em aberto que o sininho cobra — ler não é atender.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, CornerUpLeft, HandHelping, Loader2, Send, Trash2 } from 'lucide-react'
import { deleteMessage, markMessagesRead, sendMessage, setRequestDone } from '@/app/actions/messages'
import { ConfirmButton } from '@/components/confirm-button'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/types'

/** De quanto em quanto tempo a conversa procura mensagem nova. */
const POLL_MS = 12_000

export function Chat({
  messages,
  currentUserId,
}: {
  messages: Message[]
  currentUserId: string
}) {
  const router = useRouter()
  const bottomRef = React.useRef<HTMLDivElement>(null)

  // Abrir a conversa é o que zera o sininho.
  React.useEffect(() => {
    void markMessagesRead()
  }, [messages.length])

  /**
   * A conversa se atualiza sozinha, mas só com a aba à vista: buscar mensagem
   * para uma tela que ninguém está olhando é gasto sem retorno.
   */
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const pending = messages.filter((message) => message.is_request && !message.done_at)

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col gap-3 lg:h-[calc(100dvh-11rem)]">
      {pending.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {pending.length === 1 ? '1 pedido em aberto' : `${pending.length} pedidos em aberto`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {pending.slice(0, 3).map((message) => (
              <li key={message.id} className="truncate text-sm">
                <span className="text-muted-foreground">{message.author_name}:</span> {message.body}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-card p-4">
        {messages.length === 0 ? (
          <EmptyState
            title="Nenhum recado ainda"
            description="É aqui que a conversa sobre as contas fica guardada — inclusive os pedidos de um para o outro."
          />
        ) : (
          <div className="space-y-4">
            {groupByDay(messages).map((group) => (
              <div key={group.day} className="space-y-2">
                <p className="sticky top-0 z-10 text-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                    {group.label}
                  </span>
                </p>

                {group.messages.map((message) => (
                  <Bubble
                    key={message.id}
                    message={message}
                    isMine={message.author_id === currentUserId}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer />
    </div>
  )
}

function Bubble({ message, isMine }: { message: Message; isMine: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)

  const isOpenRequest = message.is_request && !message.done_at

  async function toggleDone() {
    setBusy(true)
    const result = await setRequestDone(message.id, !message.done_at)
    setBusy(false)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível atualizar', description: result.error })
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    const result = await deleteMessage(message.id)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível apagar', description: result.error })
      return
    }
    router.refresh()
  }

  return (
    <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'group max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%]',
          isMine ? 'bg-primary text-primary-foreground' : 'bg-muted',
          isOpenRequest && 'ring-2 ring-amber-500/60',
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-[11px] font-medium',
              isMine ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {message.author_name}
          </span>

          {message.is_request ? (
            <Badge variant={message.done_at ? 'success' : 'outline'} className="h-4 px-1.5 text-[10px]">
              {message.done_at ? 'feito' : 'pedido'}
            </Badge>
          ) : null}
        </div>

        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>

        <div className="mt-1 flex items-center justify-end gap-1">
          <span
            className={cn(
              'text-[10px]',
              isMine ? 'text-primary-foreground/60' : 'text-muted-foreground',
            )}
          >
            {formatTime(message.created_at)}
          </span>

          {message.is_request ? (
            <button
              type="button"
              onClick={toggleDone}
              disabled={busy}
              className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] underline-offset-2 hover:underline',
                isMine ? 'text-primary-foreground/80' : 'text-muted-foreground',
              )}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : message.done_at ? (
                <CornerUpLeft className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {message.done_at ? 'reabrir' : 'marcar como feito'}
            </button>
          ) : null}

          {isMine ? (
            <ConfirmButton
              title="Apagar este recado?"
              description="Ele sai da conversa para os dois."
              confirmLabel="Apagar"
              onConfirm={handleDelete}
              trigger={
                <button
                  type="button"
                  aria-label="Apagar recado"
                  className="rounded p-0.5 text-primary-foreground/60 opacity-0 transition-opacity hover:text-primary-foreground group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Composer() {
  const router = useRouter()
  const { toast } = useToast()

  const [body, setBody] = React.useState('')
  const [isRequest, setIsRequest] = React.useState(false)
  const [sending, setSending] = React.useState(false)

  async function submit() {
    const text = body.trim()
    if (!text || sending) return

    setSending(true)
    const result = await sendMessage(text, isRequest)
    setSending(false)

    if (!result.ok) {
      toast({ variant: 'error', title: 'Não enviou', description: result.error })
      return
    }

    setBody('')
    setIsRequest(false)
    router.refresh()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="space-y-2 rounded-lg border border-border bg-card p-3"
    >
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Enter envia, Shift+Enter quebra linha — o hábito de todo chat.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        rows={2}
        placeholder="Escreva um recado…"
        aria-label="Recado"
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsRequest((value) => !value)}
          aria-pressed={isRequest}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            isRequest
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <HandHelping className="h-3.5 w-3.5" />
          {isRequest ? 'É um pedido' : 'Marcar como pedido'}
        </button>

        <Button type="submit" size="sm" disabled={sending || !body.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar
        </Button>
      </div>

      {isRequest ? (
        <p className="text-xs text-muted-foreground">
          Pedido fica em aberto no sininho da outra pessoa até alguém marcar como feito.
        </p>
      ) : null}
    </form>
  )
}

// ---------------------------------------------------------------------------

function groupByDay(messages: Message[]) {
  const groups: { day: string; label: string; messages: Message[] }[] = []

  for (const message of messages) {
    const day = message.created_at.slice(0, 10)
    const last = groups[groups.length - 1]

    if (last?.day === day) last.messages.push(message)
    else groups.push({ day, label: dayLabel(message.created_at), messages: [message] })
  }

  return groups
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)

  if (isSameDay(date, today)) return 'Hoje'
  if (isSameDay(date, yesterday)) return 'Ontem'

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
