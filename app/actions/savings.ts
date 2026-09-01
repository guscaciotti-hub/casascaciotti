'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'

const accountSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 letras.').max(80),
  institution: z.string().trim().max(80).nullable(),
  goal_amount: z.number().positive('A meta precisa ser maior que zero.').nullable(),
  current_balance: z.number().min(0, 'O saldo não pode ser negativo.'),
})

export type SavingsAccountInput = z.infer<typeof accountSchema>

function revalidateAll() {
  revalidatePath('/reserva')
  revalidatePath('/')
}

export async function createSavingsAccount(input: SavingsAccountInput): Promise<ActionResult> {
  try {
    const parsed = accountSchema.parse(input)
    const { supabase } = await requireClient()

    const { data, error } = await supabase
      .from('savings_accounts')
      .insert({ ...parsed, updated_at: new Date().toISOString() })
      .select('id')
      .single()

    if (error || !data) return fail(`Não foi possível criar a reserva: ${error?.message ?? ''}`)

    // Snapshot inicial para o gráfico de evolução começar com um ponto.
    await writeSnapshot(supabase, data.id, parsed.current_balance)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function updateSavingsAccount(
  id: string,
  input: SavingsAccountInput,
): Promise<ActionResult> {
  try {
    const parsed = accountSchema.parse(input)
    const { supabase } = await requireClient()

    const { error } = await supabase
      .from('savings_accounts')
      .update({ ...parsed, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return fail(`Não foi possível salvar: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function deleteSavingsAccount(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase.from('savings_accounts').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/**
 * Atualiza o saldo de uma reserva e grava o snapshot do dia.
 * O snapshot é o que alimenta o gráfico de evolução; dois ajustes no mesmo dia
 * sobrescrevem o mesmo ponto em vez de criar dois.
 */
export async function updateBalance(input: {
  accountId: string
  balance: number
  snapshotDate?: string
}): Promise<ActionResult> {
  try {
    if (!Number.isFinite(input.balance) || input.balance < 0) {
      return fail('Informe um saldo válido.')
    }

    const { supabase } = await requireClient()

    const { error } = await supabase
      .from('savings_accounts')
      .update({ current_balance: input.balance, updated_at: new Date().toISOString() })
      .eq('id', input.accountId)

    if (error) return fail(`Não foi possível atualizar o saldo: ${error.message}`)

    const snapshotError = await writeSnapshot(
      supabase,
      input.accountId,
      input.balance,
      input.snapshotDate,
    )
    if (snapshotError) return fail(snapshotError)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

async function writeSnapshot(
  supabase: Awaited<ReturnType<typeof requireClient>>['supabase'],
  accountId: string,
  balance: number,
  snapshotDate?: string,
): Promise<string | null> {
  const date = snapshotDate ?? new Date().toISOString().slice(0, 10)

  const { error } = await supabase.from('savings_snapshots').upsert(
    { savings_account_id: accountId, balance, snapshot_date: date },
    { onConflict: 'savings_account_id,snapshot_date' },
  )

  return error ? `Saldo salvo, mas o histórico falhou: ${error.message}` : null
}
