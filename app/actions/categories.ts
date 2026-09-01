'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'
import { UNCATEGORIZED } from '@/lib/types'

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 letras.').max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor precisa estar no formato #RRGGBB.'),
  icon: z.string().trim().min(1).max(40),
  monthly_budget: z.number().nonnegative().nullable(),
  is_essential: z.boolean(),
})

export type CategoryInput = z.infer<typeof categorySchema>

export async function createCategory(input: CategoryInput): Promise<ActionResult> {
  try {
    const parsed = categorySchema.parse(input)
    const { supabase } = await requireClient()

    const { error } = await supabase.from('categories').insert(parsed)
    if (error) {
      return fail(
        error.code === '23505'
          ? 'Já existe uma categoria com esse nome.'
          : `Não foi possível criar a categoria: ${error.message}`,
      )
    }

    revalidatePath('/categorias')
    revalidatePath('/')
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function updateCategory(id: string, input: CategoryInput): Promise<ActionResult> {
  try {
    const parsed = categorySchema.parse(input)
    const { supabase } = await requireClient()

    const { error } = await supabase.from('categories').update(parsed).eq('id', id)
    if (error) {
      return fail(
        error.code === '23505'
          ? 'Já existe uma categoria com esse nome.'
          : `Não foi possível salvar a categoria: ${error.message}`,
      )
    }

    revalidatePath('/categorias')
    revalidatePath('/')
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/**
 * Remove uma categoria. A de fallback ("Não identificado") é protegida: sem
 * ela o pipeline de importação não tem onde colocar o que não reconheceu.
 */
export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { data: category } = await supabase
      .from('categories')
      .select('name')
      .eq('id', id)
      .maybeSingle()

    if (category?.name === UNCATEGORIZED) {
      return fail(`A categoria "${UNCATEGORIZED}" não pode ser excluída — ela é o destino padrão dos lançamentos ainda sem classificação.`)
    }

    // FK com `on delete set null`: os lançamentos sobrevivem sem categoria e
    // reaparecem na fila de revisão.
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir: ${error.message}`)

    revalidatePath('/categorias')
    revalidatePath('/')
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Quantos lançamentos e estabelecimentos dependem de uma categoria. */
export async function categoryUsage(
  id: string,
): Promise<ActionResult<{ transactions: number; merchants: number; bills: number }>> {
  try {
    const { supabase } = await requireClient()

    const [transactions, merchants, bills] = await Promise.all([
      supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', id),
      supabase.from('merchants').select('id', { count: 'exact', head: true }).eq('category_id', id),
      supabase.from('fixed_bills').select('id', { count: 'exact', head: true }).eq('category_id', id),
    ])

    return ok({
      transactions: transactions.count ?? 0,
      merchants: merchants.count ?? 0,
      bills: bills.count ?? 0,
    })
  } catch (error) {
    return fail(errorMessage(error))
  }
}
