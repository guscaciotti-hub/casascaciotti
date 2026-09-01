import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStatement } from '@/lib/parsers'
import { detectSantander, parseSantander } from '@/lib/parsers/santander'
import { normalizeDescription } from '@/lib/normalize'

const here = path.dirname(fileURLToPath(import.meta.url))
const TEXT = fs.readFileSync(path.join(here, 'fixtures', 'santander-exemplo.txt'), 'utf8')
const options = { referenceMonth: '2026-09-01' }

/**
 * O fixture reproduz o layout exato do PDF do Santander Empresas com dados
 * fictícios: data colada na descrição, valor uma ou duas linhas abaixo,
 * descrição quebrando no meio e compra internacional com três números em
 * sequência.
 */
describe('parser do Santander', () => {
  it('detecta o emissor', () => {
    expect(detectSantander(TEXT)).toBe(true)
    expect(detectSantander('Nubank fatura de março')).toBe(false)
  })

  it('lê todos os lançamentos e ignora cabeçalho e rodapé', () => {
    const transactions = parseSantander(TEXT, options)
    expect(transactions).toHaveLength(7)
  })

  it('lê data no formato DD-MM-AAAA colada na descrição', () => {
    const [primeiro] = parseSantander(TEXT, options)
    expect(primeiro.date).toBe('2026-01-02')
    expect(primeiro.amount).toBe(399.9)
  })

  it('captura a parcela do marcador PARC nn/nn', () => {
    const [primeiro] = parseSantander(TEXT, options)
    expect(primeiro).toMatchObject({ installmentCurrent: 8, installmentTotal: 10 })
    // O marcador sai da descrição normalizada; o nome fica estável.
    expect(normalizeDescription(primeiro.description)).toBe('GRUPO EXEMPLO 1018 SAO VICENTE')
  })

  it('trata pagamento da fatura como crédito, nunca como despesa', () => {
    const transactions = parseSantander(TEXT, options)
    const pagamento = transactions.find((t) => /PAGAMENTO DE FATURA/.test(t.description))
    expect(pagamento?.amount).toBe(-1300)
  })

  it('preserva o sinal negativo de um estorno de estabelecimento', () => {
    const transactions = parseSantander(TEXT, options)
    const estorno = transactions.find((t) => /LOJA\*EXEMPLO/.test(t.description))
    expect(estorno?.amount).toBe(-112.59)
  })

  it('junta a descrição que quebra em várias linhas', () => {
    const transactions = parseSantander(TEXT, options)
    const quebrada = transactions.find((t) => /BC EXEMPLO/.test(t.description))

    expect(quebrada?.amount).toBe(108.39)
    expect(quebrada?.description).toBe('KEETABR*BC EXEMPLO LTDASao Vicente')
  })

  it('usa o valor em reais na compra internacional, não o em dólar', () => {
    const transactions = parseSantander(TEXT, options)
    const internacional = transactions.find((t) => /ASSINATURA/.test(t.description))

    // As linhas são 7,89 (US$), 42,42 (R$) e 5,37 (cotação).
    expect(internacional?.amount).toBe(42.42)
  })

  it('mantém o IOF, que é cobrança real', () => {
    const transactions = parseSantander(TEXT, options)
    const iof = transactions.find((t) => /IOF/.test(t.description))
    expect(iof?.amount).toBe(1.48)
  })

  it('descarta lançamento de valor zero', () => {
    const transactions = parseSantander(TEXT, options)
    expect(transactions.some((t) => /ANUIDADE/.test(t.description))).toBe(false)
  })

  it('a soma bate com os totais declarados na fatura', () => {
    const transactions = parseSantander(TEXT, options)

    const creditos = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    const despesas = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)

    expect(Math.round(creditos * 100) / 100).toBe(-1412.59)
    expect(Math.round(despesas * 100) / 100).toBe(617.18)
  })

  it('o roteador escolhe o Santander sozinho e lê total e vencimento', () => {
    const result = parseStatement(TEXT, options)

    expect(result.parserId).toBe('santander')
    expect(result.totalAmount).toBe(13887.87)
    expect(result.dueDate).toBe('2026-09-10')
  })

  it('a mesma razão social produz sempre o mesmo texto normalizado', () => {
    // A cidade vem grudada no nome e não há como separar. Não importa: o que a
    // categorização exige é estabilidade, e uma regra "contains" resolve.
    expect(normalizeDescription('EBN *EXEMPLOHOSTCURITIBA')).toBe('EBN *EXEMPLOHOSTCURITIBA')
    expect(normalizeDescription('EBN *EXEMPLOHOSTCURITIBA')).toBe(
      normalizeDescription('EBN *EXEMPLOHOSTCURITIBA'),
    )
  })
})
