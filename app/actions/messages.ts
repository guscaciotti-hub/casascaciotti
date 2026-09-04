'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { emailToUsername } from '@/lib/auth'
import { notifyNewMessage } from '@/lib/notify'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'

const bodySchema = z.string().trim().max(2000)

const attachmentSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.string().max(120),
  size: z.number().int().nonnegative(),
})

export type AttachmentInput = z.infer<typeof attachmentSchema>

function revalidateAll() {
  revalidatePath('/recados')
  // O sininho vive no shell, então todo caminho vê a contagem mudar.
  revalidatePath('/', 'layout')
}

/**
 * Publica um recado.
 *
 * `isRequest` marca o que espera resposta — "me manda a fatura do Nubank".
 * A diferença não é decoração: pedido pendente é o que o sininho cobra, e o
 * que continua cobrando depois de lido.
 */
export async function sendMessage(
  body: string,
  isRequest = false,
  attachments: AttachmentInput[] = [],
): Promise<ActionResult> {
  try {
    const text = bodySchema.parse(body)
    const files = z.array(attachmentSchema).max(10).parse(attachments)

    // Anexo sozinho basta: mandar a fatura sem escrever nada é uso legítimo.
    if (!text && files.length === 0) return fail('Escreva alguma coisa ou anexe um arquivo.')

    const { supabase, user } = await requireClient()
    const authorName = emailToUsername(user.email) || 'alguém'

    const { error } = await supabase.from('messages').insert({
      author_id: user.id,
      author_name: authorName,
      body: text || (files.length === 1 ? files[0].name : `${files.length} arquivos`),
      is_request: isRequest,
      attachments: files,
    })
    if (error) return fail(`Não foi possível enviar: ${error.message}`)

    // Esperado de propósito: promessa solta morre com a função serverless, e
    // um aviso que às vezes não sai é pior que um envio um pouco mais lento.
    // Nada aqui lança — o recado já está gravado.
    await notifyNewMessage({
      authorUsername: authorName,
      body: text,
      isRequest,
      attachmentCount: files.length,
    })

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Marca um pedido como resolvido (ou volta a abri-lo). */
export async function setRequestDone(id: string, done: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase
      .from('messages')
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq('id', id)
    if (error) return fail(`Não foi possível atualizar o pedido: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Apaga um recado. Só quem escreveu pode apagar o próprio. */
export async function deleteMessage(id: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireClient()

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', id)
      .eq('author_id', user.id)
    if (error) return fail(`Não foi possível apagar: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/**
 * Registra que a pessoa viu a conversa até agora.
 *
 * Chamada ao abrir a tela de recados. Pedido em aberto continua contando no
 * sininho mesmo depois disto: ler não é atender.
 */
export async function markMessagesRead(): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireClient()

    const { error } = await supabase
      .from('message_reads')
      .upsert({ user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return fail(`Não foi possível marcar como lido: ${error.message}`)

    revalidatePath('/', 'layout')
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}
