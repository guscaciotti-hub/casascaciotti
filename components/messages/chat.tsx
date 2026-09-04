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
 *
 * Anexar tem que ser trivial: o pedido mais comum da casa é justamente "me
 * manda a fatura". Se o arquivo tiver que sair para o WhatsApp e voltar, a
 * tela não vale o clique. Daí o clipe, o arrastar-e-soltar e o colar
 * (Ctrl+V numa foto de conta já anexa).
 *
 * A conversa se atualiza por uma rota própria e não com `router.refresh()`:
 * recarregar a página a cada poucos segundos apagaria o rascunho que estivesse
 * sendo escrito.
 */

import * as React from 'react'
import {
  Check,
  CornerUpLeft,
  Download,
  FileText,
  HandHelping,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  deleteMessage,
  markMessagesRead,
  sendMessage,
  setRequestDone,
  type AttachmentInput,
} from '@/app/actions/messages'
import { ConfirmButton } from '@/components/confirm-button'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { Message, MessageAttachment } from '@/lib/types'

/** De quanto em quanto tempo a conversa procura mensagem nova. */
const POLL_MS = 8_000

/** Teto por arquivo, igual ao da rota de upload. */
const MAX_BYTES = 15 * 1024 * 1024

export function Chat({
  messages: initial,
  currentUserId,
}: {
  messages: Message[]
  currentUserId: string
}) {
  const [messages, setMessages] = React.useState(initial)
  const [dragging, setDragging] = React.useState(false)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const composerRef = React.useRef<{ addFiles: (files: File[]) => void }>(null)

  React.useEffect(() => setMessages(initial), [initial])

  const reload = React.useCallback(async () => {
    try {
      const response = await fetch('/api/messages', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setMessages(data.messages as Message[])
    } catch {
      // Rede caiu: fica com o que já está na tela.
    }
  }, [])

  /**
   * Só busca com a aba à vista: atualizar uma conversa que ninguém está
   * olhando é gasto sem retorno.
   */
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, POLL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  // Estar com a conversa aberta é o que zera o sininho.
  React.useEffect(() => {
    void markMessagesRead()
  }, [messages.length])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const pending = messages.filter((message) => message.is_request && !message.done_at)

  return (
    <div
      // Altura da tela menos cabeçalho, título e a barra inferior do celular.
      // `min-h` garante que numa tela baixa a conversa ainda seja usável — aí
      // a página rola, em vez de espremer a caixa de escrever.
      className="relative flex h-[calc(100dvh-17.5rem)] min-h-[22rem] flex-col gap-3 sm:h-[calc(100dvh-15rem)] lg:h-[calc(100dvh-13rem)]"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        setDragging(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        setDragging(false)
        composerRef.current?.addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80">
          <p className="text-sm font-medium">Solte para anexar</p>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5">
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
            description="É aqui que a conversa sobre as contas fica guardada — com os arquivos e os pedidos de um para o outro."
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
                    onChanged={reload}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <Composer ref={composerRef} onSent={reload} />
    </div>
  )
}

function Bubble({
  message,
  isMine,
  onChanged,
}: {
  message: Message
  isMine: boolean
  onChanged: () => void
}) {
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
    onChanged()
  }

  async function handleDelete() {
    const result = await deleteMessage(message.id)
    if (!result.ok) {
      toast({ variant: 'error', title: 'Não foi possível apagar', description: result.error })
      return
    }
    onChanged()
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
            <Badge
              variant={message.done_at ? 'success' : 'outline'}
              className="h-4 px-1.5 text-[10px]"
            >
              {message.done_at ? 'feito' : 'pedido'}
            </Badge>
          ) : null}
        </div>

        {message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        ) : null}

        {message.attachments?.length ? (
          <div className="mt-1.5 space-y-1.5">
            {message.attachments.map((attachment) => (
              <Attachment key={attachment.path} attachment={attachment} isMine={isMine} />
            ))}
          </div>
        ) : null}

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

/** Imagem aparece; qualquer outro arquivo vira uma linha para baixar. */
function Attachment({
  attachment,
  isMine,
}: {
  attachment: MessageAttachment
  isMine: boolean
}) {
  const isImage = attachment.type.startsWith('image/')

  if (!attachment.url) {
    return (
      <p className={cn('text-xs', isMine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
        {attachment.name} (link indisponível)
      </p>
    )
  }

  if (isImage) {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-64 w-auto rounded-md border border-black/10"
        />
      </a>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
        isMine
          ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
          : 'bg-background hover:bg-accent',
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
      <span className={cn(isMine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
        {formatSize(attachment.size)}
      </span>
      <Download className="h-3.5 w-3.5 shrink-0" />
    </a>
  )
}

// ---------------------------------------------------------------------------

interface Draft {
  id: string
  file: File
  previewUrl?: string
}

const Composer = React.forwardRef<{ addFiles: (files: File[]) => void }, { onSent: () => void }>(
  function Composer({ onSent }, ref) {
    const { toast } = useToast()

    const [body, setBody] = React.useState('')
    const [isRequest, setIsRequest] = React.useState(false)
    const [drafts, setDrafts] = React.useState<Draft[]>([])
    const [sending, setSending] = React.useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const addFiles = React.useCallback(
      (files: File[]) => {
        const accepted: Draft[] = []

        for (const file of files) {
          if (file.size > MAX_BYTES) {
            toast({
              variant: 'error',
              title: 'Arquivo grande demais',
              description: `${file.name} passa de ${MAX_BYTES / 1024 / 1024} MB.`,
            })
            continue
          }
          accepted.push({
            id: `${file.name}-${file.size}-${Math.random()}`,
            file,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          })
        }

        if (accepted.length > 0) setDrafts((current) => [...current, ...accepted].slice(0, 10))
      },
      [toast],
    )

    React.useImperativeHandle(ref, () => ({ addFiles }), [addFiles])

    // Cada preview segura memória até ser revogado.
    React.useEffect(() => {
      return () => {
        for (const draft of drafts) {
          if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function removeDraft(id: string) {
      setDrafts((current) => {
        const target = current.find((draft) => draft.id === id)
        if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
        return current.filter((draft) => draft.id !== id)
      })
    }

    async function submit() {
      const text = body.trim()
      if ((!text && drafts.length === 0) || sending) return

      setSending(true)

      try {
        // Os arquivos sobem antes: a mensagem só é gravada quando todos têm
        // chave, para nunca existir recado apontando para anexo que falhou.
        const uploaded: AttachmentInput[] = []

        for (const draft of drafts) {
          const form = new FormData()
          form.append('file', draft.file)

          const response = await fetch('/api/chat/upload', { method: 'POST', body: form })
          const data = await response.json()

          if (!response.ok) throw new Error(data.error ?? `Falha ao anexar ${draft.file.name}.`)
          uploaded.push(data as AttachmentInput)
        }

        const result = await sendMessage(text, isRequest, uploaded)
        if (!result.ok) throw new Error(result.error)

        for (const draft of drafts) {
          if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
        }
        setBody('')
        setDrafts([])
        setIsRequest(false)
        onSent()
      } catch (error) {
        toast({
          variant: 'error',
          title: 'Não enviou',
          description: error instanceof Error ? error.message : 'Tente de novo.',
        })
      } finally {
        setSending(false)
      }
    }

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className={cn(
          'space-y-2 rounded-lg border bg-card p-3 transition-colors',
          isRequest ? 'border-amber-500/60' : 'border-border',
        )}
      >
        {drafts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="relative flex items-center gap-2 rounded-md border border-border bg-background py-1 pl-1 pr-6 text-xs"
              >
                {draft.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.previewUrl}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <FileText className="ml-1 h-4 w-4 text-muted-foreground" />
                )}
                <span className="max-w-[10rem] truncate">{draft.file.name}</span>

                <button
                  type="button"
                  onClick={() => removeDraft(draft.id)}
                  aria-label={`Remover ${draft.file.name}`}
                  className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onPaste={(event) => {
            // Ctrl+V numa foto de conta anexa direto.
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              addFiles(files)
            }
          }}
          onKeyDown={(event) => {
            // Enter envia, Shift+Enter quebra linha — o hábito de todo chat.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={2}
          placeholder={isRequest ? 'O que você precisa?' : 'Escreva um recado…'}
          aria-label="Recado"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []))
              // Permite reanexar o mesmo arquivo depois de removê-lo.
              event.target.value = ''
            }}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Anexar arquivo"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

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
            {isRequest ? 'É um pedido' : 'Pedido'}
          </button>

          <Button
            type="submit"
            size="sm"
            className="ml-auto"
            disabled={sending || (!body.trim() && drafts.length === 0)}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>

        {isRequest ? (
          <p className="text-xs text-muted-foreground">
            Fica em aberto no sininho da outra pessoa até alguém marcar como feito.
          </p>
        ) : null}
      </form>
    )
  },
)

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
