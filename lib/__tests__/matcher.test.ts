import { describe, expect, it } from 'vitest'
import { findMatchingRule, matchBatch, ruleMatches, sortRules } from '@/lib/matcher'
import type { MatchableRule } from '@/lib/matcher'
import type { MatchType } from '@/lib/types'

let sequence = 0

function rule(
  pattern: string,
  matchType: MatchType = 'contains',
  overrides: Partial<MatchableRule> = {},
): MatchableRule {
  sequence += 1
  return {
    id: `rule-${sequence}`,
    merchant_id: `merchant-${pattern}`,
    pattern,
    match_type: matchType,
    priority: 100,
    active: true,
    ...overrides,
  }
}

describe('ruleMatches', () => {
  it('casa exact apenas na igualdade completa', () => {
    const exact = rule('IFOOD', 'exact')
    expect(ruleMatches(exact, 'IFOOD')).toBe(true)
    expect(ruleMatches(exact, 'IFOOD CLUB')).toBe(false)
  })

  it('casa contains em qualquer posição', () => {
    const contains = rule('IFOOD', 'contains')
    expect(ruleMatches(contains, 'IFOOD CLUB')).toBe(true)
    expect(ruleMatches(contains, 'PEDIDO IFOOD SP')).toBe(true)
    expect(ruleMatches(contains, 'RAPPI')).toBe(false)
  })

  it('casa regex', () => {
    const regex = rule('^POSTO\\s+\\w+', 'regex')
    expect(ruleMatches(regex, 'POSTO IPIRANGA')).toBe(true)
    expect(ruleMatches(regex, 'SUPERMERCADO POSTO')).toBe(false)
  })

  it('ignora acento e caixa dos dois lados', () => {
    const contains = rule('farmácia')
    expect(ruleMatches(contains, 'FARMACIA SAO JOAO')).toBe(true)
  })

  it('ignora regra inativa', () => {
    const inactive = rule('IFOOD', 'contains', { active: false })
    expect(ruleMatches(inactive, 'IFOOD CLUB')).toBe(false)
  })

  it('regex inválida não derruba a importação', () => {
    const broken = rule('([unclosed', 'regex')
    expect(() => ruleMatches(broken, 'QUALQUER COISA')).not.toThrow()
    expect(ruleMatches(broken, 'QUALQUER COISA')).toBe(false)
  })

  it('padrão em branco nunca casa', () => {
    expect(ruleMatches(rule('   '), 'QUALQUER COISA')).toBe(false)
  })

  it('descrição vazia nunca casa', () => {
    expect(ruleMatches(rule('IFOOD'), '')).toBe(false)
  })
})

describe('sortRules', () => {
  it('ordena exact antes de contains antes de regex', () => {
    const ordered = sortRules([rule('C', 'regex'), rule('B', 'contains'), rule('A', 'exact')])
    expect(ordered.map((item) => item.match_type)).toEqual(['exact', 'contains', 'regex'])
  })

  it('dentro do mesmo tipo, priority menor vem primeiro', () => {
    const ordered = sortRules([
      rule('B', 'contains', { priority: 200 }),
      rule('A', 'contains', { priority: 10 }),
    ])
    expect(ordered.map((item) => item.pattern)).toEqual(['A', 'B'])
  })

  it('mesma priority: padrão mais longo primeiro', () => {
    const ordered = sortRules([rule('IFOOD'), rule('IFOOD CLUB')])
    expect(ordered.map((item) => item.pattern)).toEqual(['IFOOD CLUB', 'IFOOD'])
  })
})

describe('findMatchingRule', () => {
  it('exact ganha de contains', () => {
    const exact = rule('IFOOD CLUB', 'exact')
    const contains = rule('IFOOD', 'contains')
    const found = findMatchingRule([contains, exact], 'IFOOD CLUB')
    expect(found?.rule.id).toBe(exact.id)
    expect(found?.matchedBy).toBe('exact')
  })

  it('contains ganha de regex', () => {
    const contains = rule('IFOOD', 'contains')
    const regex = rule('IFOOD.*', 'regex')
    const found = findMatchingRule([regex, contains], 'IFOOD CLUB')
    expect(found?.rule.id).toBe(contains.id)
  })

  it('o padrão contains mais longo ganha do mais curto', () => {
    const curto = rule('IFOOD', 'contains')
    const longo = rule('IFOOD CLUB', 'contains')
    const found = findMatchingRule([curto, longo], 'IFOOD CLUB ASSINATURA')
    expect(found?.rule.id).toBe(longo.id)
  })

  it('priority menor vence padrão mais longo', () => {
    const longo = rule('IFOOD CLUB', 'contains', { priority: 100 })
    const prioritario = rule('IFOOD', 'contains', { priority: 1 })
    const found = findMatchingRule([longo, prioritario], 'IFOOD CLUB')
    expect(found?.rule.id).toBe(prioritario.id)
  })

  it('devolve null quando nada casa', () => {
    expect(findMatchingRule([rule('IFOOD')], 'SUPERMERCADO BOM DIA')).toBeNull()
  })

  it('devolve null com lista vazia', () => {
    expect(findMatchingRule([], 'IFOOD')).toBeNull()
  })

  it('pula regras inativas e usa a próxima que casa', () => {
    const inativa = rule('IFOOD CLUB', 'contains', { active: false })
    const ativa = rule('IFOOD', 'contains')
    const found = findMatchingRule([inativa, ativa], 'IFOOD CLUB')
    expect(found?.rule.id).toBe(ativa.id)
  })

  it('mesma razão social cai sempre na mesma merchant', () => {
    const escola = rule('PASQUALI', 'contains', { merchant_id: 'escola' })
    const descricoes = ['PASQUALI COM ALIM', 'PASQUALI EDUC', 'PASQUALI COM ALIM CAMPINAS']
    for (const descricao of descricoes) {
      expect(findMatchingRule([escola], descricao)?.rule.merchant_id).toBe('escola')
    }
  })
})

describe('matchBatch', () => {
  it('aplica a mesma semântica de findMatchingRule em lote', () => {
    const rules = [rule('IFOOD', 'contains'), rule('MERCADO', 'contains')]
    const results = matchBatch(rules, ['IFOOD CLUB', 'MERCADO DIA', 'POSTO SHELL'])

    expect(results.map((result) => result?.rule.pattern ?? null)).toEqual([
      'IFOOD',
      'MERCADO',
      null,
    ])
  })

  it('concorda com findMatchingRule item a item', () => {
    const rules = [
      rule('IFOOD CLUB', 'exact'),
      rule('IFOOD', 'contains'),
      rule('^POSTO', 'regex'),
    ]
    const descriptions = ['IFOOD CLUB', 'IFOOD DELIVERY', 'POSTO SHELL', 'PADARIA']

    const batch = matchBatch(rules, descriptions)
    descriptions.forEach((description, index) => {
      expect(batch[index]?.rule.id ?? null).toBe(findMatchingRule(rules, description)?.rule.id ?? null)
    })
  })
})
