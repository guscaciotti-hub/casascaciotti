'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'
import { getUncategorizedId, reprocessTransactions } from '@/lib/categorization'
import { dedupeHash } from '@/lib/hash'
import { normalizeDescription } from '@/lib/normalize'

function revalidateAll() {
  revalidatePath('/')
  revalidatePath('/faturas')
  revalidatePath('/revisao', 'layout')
}

/** Reclassifica um único lançamento, sem criar regra. */
export async function reclassifyTransaction(
  transactionId: string,
  input: { merchantId: string | null; categoryId: string | null },
): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase
      .from('transactions')
      .update({
        merchant_id: input.merchantId,
        category_id: input.categoryId,
        is_reviewed: true,
      })
      .eq('id', transactionId)

    if (error) return fail(`Não foi possível reclassificar: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

const labelSchema = z.object({
  transactionId: z.string().uuid(),
  /** Merchant existente. Quando ausente, `newMerchantName` cria uma. */
  merchantId: z.string().uuid().nullable(),
  newMerchantName: z.string().trim().min(2).max(80).nullable(),
  categoryId: z.string().uuid('Escolha uma categoria.'),
  /** Cria a regra automática — marcado por padrão na interface. */
  createRule: z.boolean(),
  rulePattern: z.string().trim().max(120).nullable(),
})

export type LabelTransactionInput = z.infer<typeof labelSchema>

export interface LabelTransactionResult {
  merchantId: string
  ruleCreated: boolean
  /** Lançamentos históricos reclassificados pela regra nova. */
  reprocessed: number
}

/**
 * Rotula um lançamento não identificado.
 *
 * É o fluxo que faz o sistema aprender:
 *   1. aplica merchant e categoria ao lançamento
 *   2. cria a merchant, se for nova
 *   3. cria a regra `contains` com o padrão sugerido (editável pelo usuário)
 *   4. reprocessa retroativamente todo o histórico ainda não identificado
 *
 * O passo 4 é o que evita retrabalho: a mesma razão social cai sozinha na
 * mesma categoria nos meses seguintes e nos meses já importados.
 */
export async function labelTransaction(
  input: LabelTransactionInput,
): Promise<ActionResult<LabelTransactionResult>> {
  try {
    const parsed = labelSchema.parse(input)
    const { supabase } = await requireClient()

    const { data: transaction, error: loadError } = await supabase
      .from('transactions')
      .select('id, raw_description, normalized_description')
      .eq('id', parsed.transactionId)
      .single()

    if (loadError || !transaction) return fail('Lançamento não encontrado.')

    // 1. Resolve a merchant — existente ou nova.
    let merchantId = parsed.merchantId
    if (!merchantId) {
      if (!parsed.newMerchantName) {
        return fail('Escolha um estabelecimento existente ou informe um nome novo.')
      }

      const { data: created, error: merchantError } = await supabase
        .from('merchants')
        .insert({ display_name: parsed.newMerchantName, category_id: parsed.categoryId })
        .select('id')
        .single()

      if (merchantError || !created) {
        // Nome duplicado: reaproveita a merchant que já existe.
        const { data: existing } = await supabase
          .from('merchants')
          .select('id')
          .eq('display_name', parsed.newMerchantName)
          .maybeSingle()

        if (!existing) {
          return fail(`Não foi possível criar o estabelecimento: ${merchantError?.message ?? ''}`)
        }
        merchantId = existing.id
      } else {
        merchantId = created.id
      }
    }

    // 2. Aplica ao lançamento.
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ merchant_id: merchantId, category_id: parsed.categoryId, is_reviewed: true })
      .eq('id', parsed.transactionId)

    if (updateError) return fail(`Não foi possível salvar: ${updateError.message}`)

    // 3. Cria a regra automática.
    let ruleCreated = false
    if (parsed.createRule) {
      const pattern = normalizeDescription(
        parsed.rulePattern || transaction.normalized_description || transaction.raw_description,
      )

      if (pattern.length >= 3) {
        const { error: ruleError } = await supabase.from('merchant_rules').insert({
          merchant_id: merchantId,
          pattern,
          match_type: 'contains',
          priority: 100,
          active: true,
        })
        // Regra já existente (unique) não é erro para o usuário.
        ruleCreated = !ruleError || ruleError.code === '23505'
      }
    }

    // 4. Reprocessa o histórico ainda não identificado.
    let reprocessed = 0
    if (ruleCreated) {
      const result = await reprocessTransactions(supabase, { scope: 'unidentified' })
      reprocessed = result.updated
    }

    revalidateAll()
    return ok({ merchantId, ruleCreated, reprocessed })
  } catch (error) {
    return fail(errorMessage(error))
  }
}

const manualSchema = z.object({
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  raw_description: z.string().trim().min(2, 'Informe uma descrição.').max(200),
  amount: z.number().refine((value) => value !== 0, 'Informe um valor diferente de zero.'),
  category_id: z.string().uuid().nullable(),
  merchant_id: z.string().uuid().nullable(),
  notes: z.string().trim().max(500).nullable(),
})

export type ManualTransactionInput = z.infer<typeof manualSchema>

/** Lançamento manual, fora de fatura (dinheiro, PIX, débito). */
export async function createManualTransaction(
  input: ManualTransactionInput,
): Promise<ActionResult> {
  try {
    const parsed = manualSchema.parse(input)
    const { supabase } = await requireClient()

    const normalized = normalizeDescription(parsed.raw_description)
    const categoryId = parsed.category_id ?? (await getUncategorizedId(supabase))

    const { error } = await supabase.from('transactions').insert({
      statement_id: null,
      transaction_date: parsed.transaction_date,
      raw_description: parsed.raw_description,
      normalized_description: normalized,
      amount: parsed.amount,
      merchant_id: parsed.merchant_id,
      category_id: categoryId,
      is_reviewed: Boolean(parsed.category_id),
      dedupe_hash: dedupeHash({
        source: 'manual',
        transactionDate: parsed.transaction_date,
        rawDescription: parsed.raw_description,
        amount: parsed.amount,
      }),
      notes: parsed.notes,
    })

    if (error) {
      return fail(
        error.code === '23505'
          ? 'Já existe um lançamento idêntico nessa data.'
          : `Não foi possível lançar: ${error.message}`,
      )
    }

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function updateTransactionNotes(
  id: string,
  notes: string | null,
): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase.from('transactions').update({ notes }).eq('id', id)
    if (error) return fail(`Não foi possível salvar a observação: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}
