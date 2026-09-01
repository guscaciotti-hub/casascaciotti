import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { findMatchingRule, type MatchableRule } from '@/lib/matcher'
import { normalizeDescription } from '@/lib/normalize'
import { UNCATEGORIZED } from '@/lib/types'

/**
 * Camada que amarra normalização + matcher ao banco.
 *
 * Importação e reprocessamento retroativo passam pelas mesmas funções daqui,
 * de propósito: se os dois caminhos divergirem, o histórico deixa de bater
 * com o que a próxima fatura vai produzir.
 */

export interface RuleWithMerchant extends MatchableRule {
  merchant: { id: string; category_id: string | null } | null
}

export interface Categorization {
  merchantId: string | null
  categoryId: string | null
}

/** Carrega todas as regras ativas com a categoria da merchant já resolvida. */
export async function loadActiveRules(supabase: SupabaseClient): Promise<RuleWithMerchant[]> {
  const { data, error } = await supabase
    .from('merchant_rules')
    .select('id, merchant_id, pattern, match_type, priority, active, merchant:merchants(id, category_id)')
    .eq('active', true)

  if (error) throw new Error(`Falha ao carregar regras: ${error.message}`)

  return (data ?? []).map((row) => ({
    ...row,
    merchant: Array.isArray(row.merchant) ? (row.merchant[0] ?? null) : row.merchant,
  })) as RuleWithMerchant[]
}

/** Id da categoria "Não identificado", criada pelo seed. */
export async function getUncategorizedId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('name', UNCATEGORIZED)
    .maybeSingle()

  return data?.id ?? null
}

/**
 * Categoriza uma descrição normalizada.
 * Sem regra que case, devolve merchant nula e a categoria de fallback — o
 * lançamento entra na fila de revisão.
 */
export function categorize(
  rules: RuleWithMerchant[],
  normalizedDescription: string,
  uncategorizedId: string | null,
): Categorization {
  const match = findMatchingRule(rules, normalizedDescription)

  if (!match) {
    return { merchantId: null, categoryId: uncategorizedId }
  }

  return {
    merchantId: match.rule.merchant_id,
    categoryId: match.rule.merchant?.category_id ?? uncategorizedId,
  }
}

export interface ReprocessResult {
  /** Quantos lançamentos passaram a ter merchant/categoria. */
  updated: number
  /** Quantos foram avaliados. */
  evaluated: number
}

/**
 * Reaplica as regras ao histórico.
 *
 * Este é o passo que faz o sistema ficar mais inteligente a cada mês: ao criar
 * uma regra nova, todos os lançamentos antigos que casam com ela são
 * reclassificados de uma vez, sem retrabalho manual.
 *
 * Por padrão só mexe no que ainda não foi identificado. Passe
 * `scope: 'merchant'` com `merchantId` para reclassificar tudo de uma merchant
 * (usado quando o usuário troca a categoria dela).
 */
export async function reprocessTransactions(
  supabase: SupabaseClient,
  options: {
    scope?: 'unidentified' | 'merchant' | 'all'
    merchantId?: string
    /** Limita o reprocessamento às regras de uma merchant específica. */
    onlyRulesOfMerchantId?: string
  } = {},
): Promise<ReprocessResult> {
  const { scope = 'unidentified', merchantId, onlyRulesOfMerchantId } = options

  const allRules = await loadActiveRules(supabase)
  const rules = onlyRulesOfMerchantId
    ? allRules.filter((rule) => rule.merchant_id === onlyRulesOfMerchantId)
    : allRules

  const uncategorizedId = await getUncategorizedId(supabase)

  let query = supabase
    .from('transactions')
    .select('id, normalized_description, raw_description, merchant_id, category_id')

  if (scope === 'unidentified') {
    query = query.is('merchant_id', null)
  } else if (scope === 'merchant') {
    if (!merchantId) throw new Error('scope "merchant" exige merchantId')
    query = query.eq('merchant_id', merchantId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Falha ao carregar lançamentos: ${error.message}`)

  const rows = data ?? []
  const updates: Array<{ id: string; merchant_id: string; category_id: string | null }> = []

  for (const row of rows) {
    // Descrições antigas podem ter sido gravadas antes de uma mudança na
    // normalização — recalculamos para comparar sempre na forma corrente.
    const normalized = row.normalized_description || normalizeDescription(row.raw_description)

    if (scope === 'merchant' && merchantId) {
      // Recategoriza mantendo a merchant: a categoria dela mudou.
      const rule = allRules.find((item) => item.merchant_id === merchantId)
      const categoryId = rule?.merchant?.category_id ?? uncategorizedId
      if (row.category_id !== categoryId) {
        updates.push({ id: row.id, merchant_id: merchantId, category_id: categoryId })
      }
      continue
    }

    const match = findMatchingRule(rules, normalized)
    if (!match) continue

    const categoryId = match.rule.merchant?.category_id ?? uncategorizedId
    if (row.merchant_id === match.rule.merchant_id && row.category_id === categoryId) continue

    updates.push({
      id: row.id,
      merchant_id: match.rule.merchant_id,
      category_id: categoryId,
    })
  }

  for (const chunk of chunked(updates, 200)) {
    await Promise.all(
      chunk.map((update) =>
        supabase
          .from('transactions')
          .update({
            merchant_id: update.merchant_id,
            category_id: update.category_id,
            is_reviewed: true,
          })
          .eq('id', update.id),
      ),
    )
  }

  return { updated: updates.length, evaluated: rows.length }
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
