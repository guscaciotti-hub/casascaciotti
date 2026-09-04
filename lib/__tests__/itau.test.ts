import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStatement } from '@/lib/parsers'
import { detectItau, parseItau, parseLine } from '@/lib/parsers/itau'
import { isInvoicePayment } from '@/lib/parsers/shared'

const here = path.dirname(fileURLToPath(import.meta.url))
const TEXT = fs.readFileSync(path.join(here, 'fixtures', 'itau-exemplo.txt'), 'utf8')
const options = { referenceMonth: '2026-09-01' }

/**
 * O fixture reproduz o layout do PDF do Itaú com dados fictícios: valor colado
 * na descrição sem separador, parcela grudada no valor, e o bloco de parcelas
 * futuras que não deve ser somado.
 */
describe('parser do Itaú', () => {
  it('detecta o emissor', () => {
    expect(detectItau(TEXT)).toBe(true)
    expect(detectItau('Nubank fatura de março')).toBe(false)
  })

  it('lê os lançamentos do mês e ignora cabeçalho, limites e encargos', () => {
    // 1 pagamento + 3 compras no cartão + 4 em produtos e serviços.
    expect(parseItau(TEXT, options)).toHaveLength(8)
  })

  it('separa o valor da descrição mesmo sem espaço entre eles', () => {
    const transaction = parseLine('13/08EXEMPLOODONTOSAO JOSE DOSBR112,20', options)

    expect(transaction).toMatchObject({
      date: '2026-08-13',
      description: 'EXEMPLOODONTOSAO JOSE DOSBR',
      amount: 112.2,
    })
  })

  it('lê a parcela grudada no valor', () => {
    const transaction = parseLine('10/08LOJAEXEMPLO*M 01/03193,33', options)

    expect(transaction).toMatchObject({
      description: 'LOJAEXEMPLO*M',
      amount: 193.33,
      installmentCurrent: 1,
      installmentTotal: 3,
    })
  })

  it('não rouba dígitos da parcela quando o valor passa de mil', () => {
    // A leitura ingênua do "número no fim da linha" devolveria 33.193,33 aqui.
    const transaction = parseLine('10/08LOJAEXEMPLO*M 01/033.193,33', options)

    expect(transaction?.amount).toBe(3193.33)
    expect(transaction).toMatchObject({ installmentCurrent: 1, installmentTotal: 3 })
  })

  it('ignora o bloco de parcelas que ainda vão vencer', () => {
    const transactions = parseItau(TEXT, options)
    const parcelas = transactions.filter((t) => t.installmentCurrent === 2)

    // As linhas 02/03 e 02/02 existem no PDF, mas em "próximas faturas".
    expect(parcelas).toHaveLength(0)
  })

  it('trata o débito automático como pagamento da fatura', () => {
    const transactions = parseItau(TEXT, options)
    const pagamento = transactions.find((t) => /PAGAMENTO DEB/.test(t.description))

    expect(pagamento?.amount).toBe(-1266.5)
    expect(isInvoicePayment(pagamento!.description)).toBe(true)
  })

  it('ignora a data solta do vencimento, que não tem valor', () => {
    expect(parseLine('10/09/2026', options)).toBeNull()
  })

  it('a soma bate com os totais declarados na fatura', () => {
    const transactions = parseItau(TEXT, options)

    const despesas = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const creditos = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)

    // "Total dos lançamentos atuais 1.009,83" e "Total dos pagamentos -1.266,50".
    expect(Math.round(despesas * 100) / 100).toBe(1009.83)
    expect(Math.round(creditos * 100) / 100).toBe(-1266.5)
  })

  it('lê o total desta fatura, não o da fatura anterior', () => {
    const result = parseStatement(TEXT, options)

    expect(result.parserId).toBe('itau')
    // O PDF imprime "Total da fatura anterior 1.266,50" logo acima.
    expect(result.totalAmount).toBe(1009.83)
    expect(result.dueDate).toBe('2026-09-10')
  })
})
