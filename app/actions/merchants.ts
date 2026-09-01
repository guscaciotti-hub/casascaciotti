'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'
import { reprocessTransactions } from '@/lib/categorization'
import { normalizeDescription, suggestPattern } from '@/lib/normalize'

const merchantSchema = z.object({
  display_name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 letras.').max(80),
  category_id: z.string().uuid('Escolha uma categoria.'),
  notes: z.string().trim().max(500).nullable(),
})

const ruleSchema = z.object({
  merchant_id: z.string().uuid(),
  pattern: z.string().trim().min(3, 'O padrão precisa ter pelo menos 3 caracteres.').max(120),
  match_type: z.enum(['exact', 'contains', 'regex']),
  priority: z.number().int().min(1).max(1000),
  active: z.boolean(),
})

export type MerchantInput = z.infer<typeof merchantSchema>
export type RuleInput = z.infer<typeof ruleSchema>

function revalidateAll() {
  revalidatePath('/estabelecimentos')
  revalidatePath('/faturas')
  revalidatePath('/')
}

export async function createMerchant(input: MerchantInput): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = merchantSchema.parse(input)
    const { supabase } = await requireClient()

    const { data, error } = await supabase.from('merchants').insert(parsed).select('id').single()
    if (error) {
      return fail(
        error.code === '23505'
          ? 'Já existe um estabelecimento com esse nome.'
          : `Não foi possível criar o estabelecimento: ${error.message}`,
      )
    }

    revalidateAll()
    return ok({ id: data.id })
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/**
 * Atualiza um estabelecimento. Quando a categoria muda, `reprocessHistory`
 * decide se os lançamentos antigos daquela merchant acompanham a mudança.
 */
export async function updateMerchant(
  id: string,
  input: MerchantInput,
  options: { reprocessHistory?: boolean } = {},
): Promise<ActionResult<{ reprocessed: number }>> {
  try {
    const parsed = merchantSchema.parse(input)
    const { supabase } = await requireClient()

    const { data: current } = await supabase
      .from('merchants')
      .select('category_id')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase.from('merchants').update(parsed).eq('id', id)
    if (error) {
      return fail(
        error.code === '23505'
          ? 'Já existe um estabelecimento com esse nome.'
          : `Não foi possível salvar: ${error.message}`,
      )
    }

    let reprocessed = 0
    const categoryChanged = current?.category_id !== parsed.category_id
    if (categoryChanged && options.reprocessHistory) {
      const result = await reprocessTransactions(supabase, { scope: 'merchant', merchantId: id })
      reprocessed = result.updated
    }

    revalidateAll()
    return ok({ reprocessed })
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function deleteMerchant(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    // `on delete cascade` nas regras, `set null` nas transações: o histórico
    // fica, mas volta para a fila de revisão.
    const { error } = await supabase.from('merchants').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function createRule(
  input: RuleInput,
  options: { reprocessHistory?: boolean } = {},
): Promise<ActionResult<{ reprocessed: number }>> {
  try {
    const parsed = ruleSchema.parse(input)
    if (parsed.match_type === 'regex') assertValidRegex(parsed.pattern)

    const { supabase } = await requireClient()

    const { error } = await supabase.from('merchant_rules').insert({
      ...parsed,
      // Padrões são comparados sem acento e em maiúsculas — gravamos assim.
      pattern: parsed.match_type === 'regex' ? parsed.pattern : normalizeDescription(parsed.pattern),
    })

    if (error) {
      return fail(
        error.code === '23505'
          ? 'Esse padrão já está cadastrado para este estabelecimento.'
          : `Não foi possível criar a regra: ${error.message}`,
      )
    }

    let reprocessed = 0
    if (options.reprocessHistory !== false) {
      const result = await reprocessTransactions(supabase, { scope: 'unidentified' })
      reprocessed = result.updated
    }

    revalidateAll()
    return ok({ reprocessed })
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function updateRule(id: string, input: RuleInput): Promise<ActionResult> {
  try {
    const parsed = ruleSchema.parse(input)
    if (parsed.match_type === 'regex') assertValidRegex(parsed.pattern)

    const { supabase } = await requireClient()

    const { error } = await supabase
      .from('merchant_rules')
      .update({
        ...parsed,
        pattern:
          parsed.match_type === 'regex' ? parsed.pattern : normalizeDescription(parsed.pattern),
      })
      .eq('id', id)

    if (error) return fail(`Não foi possível salvar a regra: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function deleteRule(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase.from('merchant_rules').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir a regra: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Reaplica todas as regras aos lançamentos ainda não identificados. */
export async function reprocessUnidentified(): Promise<ActionResult<{ updated: number }>> {
  try {
    const { supabase } = await requireClient()
    const result = await reprocessTransactions(supabase, { scope: 'unidentified' })

    revalidateAll()
    return ok({ updated: result.updated })
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Sugestão de padrão para a interface, a partir de uma descrição bruta. */
export async function suggestRulePattern(rawDescription: string): Promise<ActionResult<string>> {
  return ok(suggestPattern(normalizeDescription(rawDescription)))
}

function assertValidRegex(pattern: string) {
  try {
    new RegExp(pattern)
  } catch {
    throw new Error('Expressão regular inválida.')
  }
}
