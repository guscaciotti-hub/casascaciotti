import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { categorize, getUncategorizedId, loadActiveRules } from '@/lib/categorization'
import { dedupeHash } from '@/lib/hash'
import { normalizeDescription } from '@/lib/normalize'
import { parseStatement } from '@/lib/parsers'
import { isInvoicePayment } from '@/lib/parsers/shared'
import { extractPdfText } from '@/lib/pdf'

export interface ImportInput {
  file: File
  source: string
  referenceMonth: string
  userId: string
}

export interface ImportSummary {
  statementId: string
  parserId: string
  parserLabel: string
  /** Lançamentos que o parser encontrou no PDF. */
  parsed: number
  /** Lançamentos efetivamente gravados. */
  inserted: number
  /** Ignorados por já existirem (mesmo `dedupe_hash`). */
  duplicates: number
  /** Gravados já com merchant reconhecida. */
  recognized: number
  /** Gravados sem merchant — vão para a fila de revisão. */
  unidentified: number
  /** Pagamentos da própria fatura: fora do gasto e fora da revisão. */
  payments: number
  totalAmount: number
  fileUrl: string | null
}

/**
 * Pipeline completo de importação de fatura:
 * upload → extração de texto → parse → normalização → categorização → gravação.
 *
 * A gravação usa `upsert` com `ignoreDuplicates` sobre `dedupe_hash`, então
 * reimportar a mesma fatura é seguro e o resumo informa quantos foram pulados.
 */
export async function importStatement(
  supabase: SupabaseClient,
  input: ImportInput,
): Promise<ImportSummary> {
  const buffer = Buffer.from(await input.file.arrayBuffer())

  // 1. Extração — sempre server-side.
  const text = await extractPdfText(buffer)
  if (!text.trim()) {
    throw new Error(
      'Não foi possível ler texto deste PDF. Se a fatura for uma imagem digitalizada, exporte o PDF original do banco.',
    )
  }

  // 2. Parse.
  const parsed = parseStatement(text, {
    referenceMonth: input.referenceMonth,
    preferredParserId: input.source,
  })

  if (parsed.transactions.length === 0) {
    throw new Error(
      'Nenhum lançamento foi reconhecido neste PDF. Confira se o banco selecionado está correto — ou adicione um parser para este emissor.',
    )
  }

  // 3. Storage.
  const fileUrl = await uploadPdf(supabase, buffer, input)

  // 4. Cabeçalho da fatura.
  const expenseTotal = parsed.transactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  const { data: statement, error: statementError } = await supabase
    .from('statements')
    .insert({
      source: input.source,
      reference_month: input.referenceMonth,
      file_name: input.file.name,
      file_url: fileUrl,
      total_amount: parsed.totalAmount ?? round2(expenseTotal),
      due_date: parsed.dueDate,
      imported_by: input.userId,
    })
    .select('id')
    .single()

  if (statementError || !statement) {
    throw new Error(`Não foi possível registrar a fatura: ${statementError?.message ?? ''}`)
  }

  // 5. Normalização + categorização.
  const rules = await loadActiveRules(supabase)
  const uncategorizedId = await getUncategorizedId(supabase)

  const rows = parsed.transactions.map((transaction) => {
    const normalized = normalizeDescription(transaction.description)
    const { merchantId, categoryId } = categorize(rules, normalized, uncategorizedId)
    // Pagar o cartão não é gasto nem tem o que revisar.
    const isPayment = isInvoicePayment(transaction.description)

    return {
      statement_id: statement.id,
      transaction_date: transaction.date,
      raw_description: transaction.description,
      normalized_description: normalized,
      amount: round2(transaction.amount),
      installment_current: transaction.installmentCurrent ?? null,
      installment_total: transaction.installmentTotal ?? null,
      merchant_id: merchantId,
      category_id: categoryId,
      is_payment: isPayment,
      // Reconhecido já entra revisado; pagamento também, porque não há o que
      // decidir nele. O resto vai para a fila.
      is_reviewed: merchantId !== null || isPayment,
      dedupe_hash: dedupeHash({
        source: input.source,
        transactionDate: transaction.date,
        rawDescription: transaction.description,
        amount: round2(transaction.amount),
      }),
    }
  })

  // Duplicatas dentro do próprio PDF (mesma compra impressa duas vezes)
  // quebrariam o upsert em lote — resolvemos antes de mandar.
  const unique = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!unique.has(row.dedupe_hash)) unique.set(row.dedupe_hash, row)
  }

  const { data: inserted, error: insertError } = await supabase
    .from('transactions')
    .upsert([...unique.values()], { onConflict: 'dedupe_hash', ignoreDuplicates: true })
    .select('id, merchant_id, is_payment')

  if (insertError) {
    throw new Error(`Não foi possível gravar os lançamentos: ${insertError.message}`)
  }

  const insertedRows = inserted ?? []
  const payments = insertedRows.filter((row) => row.is_payment).length
  const recognized = insertedRows.filter((row) => row.merchant_id !== null && !row.is_payment).length

  return {
    statementId: statement.id,
    parserId: parsed.parserId,
    parserLabel: parsed.parserLabel,
    parsed: parsed.transactions.length,
    inserted: insertedRows.length,
    duplicates: parsed.transactions.length - insertedRows.length,
    recognized,
    payments,
    unidentified: insertedRows.length - recognized - payments,
    totalAmount: round2(expenseTotal),
    fileUrl,
  }
}

/** Sobe o PDF para o bucket privado. Falha aqui não aborta a importação. */
async function uploadPdf(
  supabase: SupabaseClient,
  buffer: Buffer,
  input: ImportInput,
): Promise<string | null> {
  const safeName = input.file.name.replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${input.referenceMonth.slice(0, 7)}/${input.source}/${Date.now()}-${safeName}`

  const { error } = await supabase.storage.from('statements').upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: false,
  })

  if (error) return null
  return path
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
