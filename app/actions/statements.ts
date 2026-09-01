'use server'

import { revalidatePath } from 'next/cache'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'

/**
 * Exclui uma fatura e, junto, seus lançamentos (`on delete cascade`) e o PDF
 * no Storage. Ação destrutiva — a interface confirma antes de chamar.
 */
export async function deleteStatement(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { data: statement } = await supabase
      .from('statements')
      .select('file_url')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('statements').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir a fatura: ${error.message}`)

    if (statement?.file_url) {
      await supabase.storage.from('statements').remove([statement.file_url])
    }

    revalidatePath('/faturas')
    revalidatePath('/')
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Link temporário para baixar o PDF original de uma fatura. */
export async function statementDownloadUrl(id: string): Promise<ActionResult<string>> {
  try {
    const { supabase } = await requireClient()

    const { data: statement } = await supabase
      .from('statements')
      .select('file_url')
      .eq('id', id)
      .maybeSingle()

    if (!statement?.file_url) return fail('Esta fatura não tem PDF guardado.')

    const { data, error } = await supabase.storage
      .from('statements')
      .createSignedUrl(statement.file_url, 60 * 5)

    if (error || !data) return fail('Não foi possível gerar o link do PDF.')

    return ok(data.signedUrl)
  } catch (error) {
    return fail(errorMessage(error))
  }
}
