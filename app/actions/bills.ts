'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { errorMessage, fail, ok, requireClient, type ActionResult } from '@/app/actions/shared'

const billSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 letras.').max(80),
  amount: z.number().min(0, 'O valor não pode ser negativo.'),
  due_day: z.number().int().min(1, 'O vencimento vai de 1 a 31.').max(31, 'O vencimento vai de 1 a 31.'),
  category_id: z.string().uuid().nullable(),
  is_autopay: z.boolean(),
  is_active: z.boolean(),
  notes: z.string().trim().max(500).nullable(),
})

export type FixedBillInput = z.infer<typeof billSchema>

function revalidateAll() {
  revalidatePath('/contas-fixas')
  revalidatePath('/')
}

export async function createFixedBill(input: FixedBillInput): Promise<ActionResult> {
  try {
    const parsed = billSchema.parse(input)
    const { supabase } = await requireClient()

    const { error } = await supabase.from('fixed_bills').insert(parsed)
    if (error) return fail(`Não foi possível criar a conta: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function updateFixedBill(id: string, input: FixedBillInput): Promise<ActionResult> {
  try {
    const parsed = billSchema.parse(input)
    const { supabase } = await requireClient()

    const { error } = await supabase.from('fixed_bills').update(parsed).eq('id', id)
    if (error) return fail(`Não foi possível salvar a conta: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

export async function deleteFixedBill(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { error } = await supabase.from('fixed_bills').delete().eq('id', id)
    if (error) return fail(`Não foi possível excluir a conta: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/**
 * Marca (ou desmarca) uma conta fixa como paga no mês.
 * Grava em `bill_payments` com upsert na chave (conta, mês) — o toggle pode
 * ir e voltar quantas vezes for preciso sem duplicar linha.
 */
export async function toggleBillPayment(input: {
  fixedBillId: string
  referenceMonth: string
  isPaid: boolean
  amountPaid?: number | null
}): Promise<ActionResult> {
  try {
    if (!/^\d{4}-\d{2}-01$/.test(input.referenceMonth)) {
      return fail('Mês de referência inválido.')
    }

    const { supabase } = await requireClient()

    const { error } = await supabase.from('bill_payments').upsert(
      {
        fixed_bill_id: input.fixedBillId,
        reference_month: input.referenceMonth,
        is_paid: input.isPaid,
        paid_at: input.isPaid ? new Date().toISOString() : null,
        amount_paid: input.isPaid ? (input.amountPaid ?? null) : null,
      },
      { onConflict: 'fixed_bill_id,reference_month' },
    )

    if (error) return fail(`Não foi possível atualizar o pagamento: ${error.message}`)

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}
