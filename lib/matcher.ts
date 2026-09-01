/**
 * Matcher de `merchant_rules`.
 *
 * Recebe uma descrição já normalizada (`lib/normalize.ts`) e devolve a primeira
 * regra que casa, respeitando a ordem de precedência do sistema:
 *
 *   1. `exact`     — igualdade literal
 *   2. `contains`  — substring, do padrão mais longo para o mais curto,
 *                    para "IFOOD CLUB" ganhar de "IFOOD"
 *   3. `regex`     — expressão regular
 *
 * Dentro de cada tipo, `priority` menor é avaliada primeiro.
 *
 * Esta é a segunda peça em que bug silencioso vira dado errado.
 * Toda mudança aqui precisa vir com teste em `lib/__tests__/matcher.test.ts`.
 */

import type { MatchType } from '@/lib/types'

export interface MatchableRule {
  id: string
  merchant_id: string
  pattern: string
  match_type: MatchType
  priority: number
  active: boolean
}

export interface MatchResult<R extends MatchableRule = MatchableRule> {
  rule: R
  matchedBy: MatchType
}

const TYPE_ORDER: Record<MatchType, number> = {
  exact: 0,
  contains: 1,
  regex: 2,
}

/** Normaliza o padrão para comparação: sem acento, maiúsculo, sem espaço extra. */
function canonicalPattern(pattern: string): string {
  return pattern
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Ordena as regras na ordem de avaliação canônica.
 * Exportada porque a tela de manutenção mostra as regras nessa mesma ordem —
 * o usuário precisa ver qual ganha de qual.
 */
export function sortRules<R extends MatchableRule>(rules: R[]): R[] {
  return [...rules].sort((a, b) => {
    const byType = TYPE_ORDER[a.match_type] - TYPE_ORDER[b.match_type]
    if (byType !== 0) return byType

    const byPriority = a.priority - b.priority
    if (byPriority !== 0) return byPriority

    // Padrão mais longo primeiro: "IFOOD CLUB" antes de "IFOOD".
    const byLength = b.pattern.length - a.pattern.length
    if (byLength !== 0) return byLength

    return a.pattern.localeCompare(b.pattern)
  })
}

/** Testa uma única regra contra a descrição normalizada. */
export function ruleMatches(rule: MatchableRule, normalizedDescription: string): boolean {
  if (!rule.active) return false

  const pattern = canonicalPattern(rule.pattern)
  if (!pattern) return false

  const target = canonicalPattern(normalizedDescription)
  if (!target) return false

  switch (rule.match_type) {
    case 'exact':
      return target === pattern
    case 'contains':
      return target.includes(pattern)
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(normalizedDescription)
      } catch {
        // Regex inválida gravada pelo usuário nunca derruba uma importação.
        return false
      }
    default:
      return false
  }
}

/**
 * Encontra a primeira regra que casa com a descrição normalizada.
 * Retorna `null` quando nenhuma casa — o chamador então marca o lançamento
 * como "Não identificado" e pendente de revisão.
 */
export function findMatchingRule<R extends MatchableRule>(
  rules: R[],
  normalizedDescription: string,
): MatchResult<R> | null {
  const ordered = sortRules(rules.filter((rule) => rule.active))

  for (const rule of ordered) {
    if (ruleMatches(rule, normalizedDescription)) {
      return { rule, matchedBy: rule.match_type }
    }
  }

  return null
}

/**
 * Aplica o conjunto de regras a um lote de descrições de uma vez.
 * Usado tanto na importação quanto no reprocessamento retroativo, para que os
 * dois caminhos compartilhem exatamente a mesma semântica.
 */
export function matchBatch<R extends MatchableRule>(
  rules: R[],
  normalizedDescriptions: string[],
): Array<MatchResult<R> | null> {
  const ordered = sortRules(rules.filter((rule) => rule.active))
  return normalizedDescriptions.map((description) => {
    for (const rule of ordered) {
      if (ruleMatches(rule, description)) {
        return { rule, matchedBy: rule.match_type }
      }
    }
    return null
  })
}
