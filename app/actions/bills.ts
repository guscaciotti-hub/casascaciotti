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

    // Entra no fim da planilha, como uma linha nova entraria.
    const { data: last } = await supabase
      .from('fixed_bills')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabase
      .from('fixed_bills')
      .insert({ ...parsed, sort_order: Number(last?.sort_order ?? 0) + 10 })
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
 *
 * `amountPaid` é o total que saiu de fato — o que importa em luz, água e
 * telefone, que variam todo mês e cujo valor cadastrado é só referência.
 * `interestPaid` separa os juros de um pagamento em atraso, para dar para ver
 * quanto a casa gastou de juros no ano sem confundir com o valor da conta.
 *
 * Upsert na chave (conta, mês): o toggle pode ir e voltar quantas vezes for
 * preciso sem duplicar linha.
 */
export async function toggleBillPayment(input: {
  fixedBillId: string
  referenceMonth: string
  isPaid: boolean
  amountPaid?: number | null
  interestPaid?: number | null
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
        // Desmarcar limpa os valores: o mês volta a ficar em aberto.
        amount_paid: input.isPaid ? (input.amountPaid ?? null) : null,
        interest_paid: input.isPaid ? (input.interestPaid || null) : null,
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

// ---------------------------------------------------------------------------
// Planilha de contas
// ---------------------------------------------------------------------------
// A visão planilha edita célula a célula, e cada célula é de uma dessas duas
// origens: o nome vive na conta (`fixed_bills`), todo o resto vive na linha
// daquele mês (`bill_payments`). Uma ação só, com patch parcial, para o
// componente não precisar saber onde cada coluna mora.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const sheetPatchSchema = z.object({
  name: z.string().trim().min(1, 'A conta precisa de um nome.').max(80).optional(),
  amount_due: z.number().min(0, 'O valor não pode ser negativo.').nullable().optional(),
  installment: z.string().trim().max(40).nullable().optional(),
  due_date: z.string().regex(ISO_DATE, 'Data inválida.').nullable().optional(),
  is_paid: z.boolean().optional(),
  paid_by: z.string().trim().max(60).nullable().optional(),
  paid_on: z.string().regex(ISO_DATE, 'Data inválida.').nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

export type BillSheetPatch = z.infer<typeof sheetPatchSchema>

/** Salva uma ou mais células da linha de uma conta num mês. */
export async function saveBillRow(
  fixedBillId: string,
  referenceMonth: string,
  patch: BillSheetPatch,
): Promise<ActionResult> {
  try {
    if (!/^\d{4}-\d{2}-01$/.test(referenceMonth)) return fail('Mês de referência inválido.')

    const parsed = sheetPatchSchema.parse(patch)
    const { name, ...monthly } = parsed
    const { supabase } = await requireClient()

    if (name !== undefined) {
      const { error } = await supabase.from('fixed_bills').update({ name }).eq('id', fixedBillId)
      if (error) return fail(`Não foi possível renomear a conta: ${error.message}`)
    }

    if (Object.keys(monthly).length > 0) {
      // Marcar o Status preenche "Pago em:" com hoje, quando ela ainda não
      // digitou uma data — é o que ela faria em seguida de qualquer jeito.
      // Desmarcar limpa a data, para a linha não ficar dizendo que foi paga.
      const extra: Record<string, unknown> = {}
      if (monthly.is_paid === true) {
        extra.paid_at = new Date().toISOString()
        if (patch.paid_on === undefined) extra.paid_on = todayIso()
      }
      if (monthly.is_paid === false) {
        extra.paid_at = null
        extra.paid_on = null
        // O que saiu de fato deixa de valer; o previsto do mês continua.
        extra.amount_paid = null
        extra.interest_paid = null
      }

      const { error } = await supabase.from('bill_payments').upsert(
        {
          fixed_bill_id: fixedBillId,
          reference_month: referenceMonth,
          ...monthly,
          ...extra,
        },
        { onConflict: 'fixed_bill_id,reference_month' },
      )
      if (error) return fail(`Não foi possível salvar: ${error.message}`)
    }

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/**
 * Cria uma linha nova no fim da planilha.
 *
 * Só pede o nome: na planilha se digita o Tipo e se preenche o resto depois,
 * célula a célula. Um formulário aqui quebraria essa mecânica.
 */
export async function createBillRow(name: string): Promise<ActionResult<{ id: string }>> {
  try {
    const cleanName = z.string().trim().min(1, 'Digite o nome da conta.').max(80).parse(name)
    const { supabase } = await requireClient()

    const { data: last } = await supabase
      .from('fixed_bills')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('fixed_bills')
      .insert({
        name: cleanName,
        amount: 0,
        // O vencimento de verdade é o da coluna, mês a mês. Este é só o padrão
        // de quando a conta não tem data nenhuma informada.
        due_day: 10,
        is_autopay: false,
        is_active: true,
        sort_order: Number(last?.sort_order ?? 0) + 10,
      })
      .select('id')
      .single()

    if (error || !data) return fail(`Não foi possível criar a conta: ${error?.message ?? ''}`)

    revalidateAll()
    return ok({ id: data.id as string })
  } catch (error) {
    return fail(errorMessage(error))
  }
}

/** Sobe ou desce uma linha, trocando de lugar com a vizinha. */
export async function moveBillRow(id: string, direction: 'up' | 'down'): Promise<ActionResult> {
  try {
    const { supabase } = await requireClient()

    const { data } = await supabase
      .from('fixed_bills')
      .select('id, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('created_at')

    const rows = data ?? []
    const index = rows.findIndex((row) => row.id === id)
    if (index < 0) return fail('Conta não encontrada.')

    const neighbour = rows[direction === 'up' ? index - 1 : index + 1]
    if (!neighbour) return ok() // Já está na ponta: nada a fazer.

    // Empate em `sort_order` (contas criadas antes da coluna existir) faria a
    // troca não mudar nada. Reatribui posições distintas antes de trocar.
    const positions = rows.map((_, position) => (position + 1) * 10)
    const swapped = [...rows]
    swapped[index] = neighbour
    swapped[direction === 'up' ? index - 1 : index + 1] = rows[index]

    for (const [position, row] of swapped.entries()) {
      if (Number(row.sort_order) === positions[position]) continue
      const { error } = await supabase
        .from('fixed_bills')
        .update({ sort_order: positions[position] })
        .eq('id', row.id)
      if (error) return fail(`Não foi possível mover a linha: ${error.message}`)
    }

    revalidateAll()
    return ok()
  } catch (error) {
    return fail(errorMessage(error))
  }
}

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
