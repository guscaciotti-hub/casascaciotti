'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { emailToUsername } from '@/lib/auth'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'

const bodySchema = z.string().trim().min(1, 'Escreva alguma coisa.').max(2000)

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
export async function sendMessage(body: string, isRequest = false): Promise<ActionResult> {
  try {
    const text = bodySchema.parse(body)
    const { supabase, user } = await requireClient()

    const { error } = await supabase.from('messages').insert({
      author_id: user.id,
      author_name: emailToUsername(user.email) || 'alguém',
      body: text,
      is_request: isRequest,
    })
    if (error) return fail(`Não foi possível enviar: ${error.message}`)

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
