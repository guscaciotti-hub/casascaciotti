import { describe, expect, it } from 'vitest'
import { parseStatement, selectParser } from '@/lib/parsers'
import { parseGeneric } from '@/lib/parsers/generic'
import { parseNubank, detectNubank } from '@/lib/parsers/nubank'
import {
  isCreditDescription,
  isInvoicePayment,
  parseBrlAmount,
  resolveYear,
} from '@/lib/parsers/shared'

const options = { referenceMonth: '2026-03-01' }

describe('parseBrlAmount', () => {
  it('lê os formatos usados nas faturas', () => {
    expect(parseBrlAmount('R$ 1.234,56')).toBe(1234.56)
    expect(parseBrlAmount('1.234,56')).toBe(1234.56)
    expect(parseBrlAmount('45,00')).toBe(45)
    expect(parseBrlAmount('-R$ 120,00')).toBe(-120)
    expect(parseBrlAmount('120,00-')).toBe(-120)
  })

  it('devolve null para texto que não é valor', () => {
    expect(parseBrlAmount('LIMITE DISPONIVEL')).toBeNull()
    expect(parseBrlAmount('')).toBeNull()
  })
})

describe('resolveYear', () => {
  it('atribui o ano anterior a compras de dezembro numa fatura de janeiro', () => {
    expect(resolveYear(12, '2026-01-01')).toBe(2025)
  })

  it('mantém o ano da referência no caso normal', () => {
    expect(resolveYear(2, '2026-03-01')).toBe(2026)
  })
})

describe('parseGeneric', () => {
  it('lê linhas no formato DD/MM DESCRIÇÃO R$ 1.234,56', () => {
    const text = [
      'FATURA DE MARÇO',
      'DATA DESCRICAO VALOR',
      '12/02 SUPERMERCADO BOM DIA R$ 320,45',
      '14/02 PAG*PASQUALI COM ALIM LTDA R$ 1.850,00',
      'TOTAL DA FATURA R$ 2.170,45',
      'LIMITE DISPONIVEL R$ 5.000,00',
    ].join('\n')

    const transactions = parseGeneric(text, options)

    expect(transactions).toHaveLength(2)
    expect(transactions[0]).toMatchObject({
      date: '2026-02-12',
      description: 'SUPERMERCADO BOM DIA',
      amount: 320.45,
    })
    expect(transactions[1].amount).toBe(1850)
  })

  it('captura parcelas', () => {
    const text = '05/02 MAGAZINE LUIZA PARC 3/10 R$ 199,90'
    const [transaction] = parseGeneric(text, options)

    expect(transaction.installmentCurrent).toBe(3)
    expect(transaction.installmentTotal).toBe(10)
  })

  it('marca estorno e pagamento como valor negativo', () => {
    const text = [
      '03/02 ESTORNO SUPERMERCADO BOM DIA R$ 50,00',
      '05/02 PAGAMENTO RECEBIDO R$ 1.000,00',
      '06/02 PADARIA CENTRAL R$ 22,00',
    ].join('\n')

    const transactions = parseGeneric(text, options)
    expect(transactions.map((item) => item.amount)).toEqual([-50, -1000, 22])
  })

  it('respeita o sinal negativo explícito', () => {
    const [transaction] = parseGeneric('07/02 AJUSTE LOJA -R$ 30,00', options)
    expect(transaction.amount).toBe(-30)
  })

  it('ignora cabeçalho, rodapé e totalizadores', () => {
    const text = [
      'Pagina 1 de 3',
      'www.banco.com.br',
      'TOTAL A PAGAR R$ 900,00',
      'SALDO ANTERIOR R$ 0,00',
      'PAGAMENTO MINIMO R$ 90,00',
    ].join('\n')

    expect(parseGeneric(text, options)).toHaveLength(0)
  })

  it('não inventa lançamento a partir de linha sem valor', () => {
    expect(parseGeneric('12/02 SUPERMERCADO BOM DIA', options)).toHaveLength(0)
  })
})

describe('parseNubank', () => {
  const nubankInline = [
    'Nubank — Fatura de março',
    'nubank.com.br',
    'TRANSACOES',
    '14 MAR Uber* Trip R$ 24,90',
    '15 MAR Ifood*Restaurante R$ 68,40',
    '16 MAR Magazine Luiza 2/6 R$ 149,90',
    'LIMITE',
    'Limite disponivel R$ 3.000,00',
  ].join('\n')

  it('detecta o emissor', () => {
    expect(detectNubank(nubankInline)).toBe(true)
    expect(detectNubank('Banco do Brasil fatura')).toBe(false)
  })

  it('lê o formato de uma linha por lançamento', () => {
    const transactions = parseNubank(nubankInline, options)

    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toMatchObject({ date: '2026-03-14', amount: 24.9 })
    expect(transactions[2]).toMatchObject({ installmentCurrent: 2, installmentTotal: 6 })
  })

  it('lê o formato de três linhas (data, descrição, valor)', () => {
    const text = [
      'Nubank',
      'TRANSACOES',
      '14 MAR',
      'Uber* Trip',
      'R$ 24,90',
      '15 MAR',
      'Supermercado Bom Dia',
      'R$ 320,45',
    ].join('\n')

    const transactions = parseNubank(text, options)

    expect(transactions).toHaveLength(2)
    expect(transactions[1]).toMatchObject({
      date: '2026-03-15',
      description: 'Supermercado Bom Dia',
      amount: 320.45,
    })
  })

  it('descarta o bloco de limites e próximas faturas', () => {
    const text = [
      'Nubank',
      'PROXIMAS FATURAS',
      '10 ABR Parcela futura R$ 500,00',
      'TRANSACOES',
      '12 MAR Padaria Central R$ 18,00',
    ].join('\n')

    const transactions = parseNubank(text, options)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].description).toBe('Padaria Central')
  })
})

describe('parseStatement', () => {
  it('roteia para o parser do Nubank quando detecta o emissor', () => {
    const text = 'Nubank\nTRANSACOES\n14 MAR Uber* Trip R$ 24,90'
    const result = parseStatement(text, options)

    expect(result.parserId).toBe('nubank')
    expect(result.transactions).toHaveLength(1)
  })

  it('cai no genérico quando não reconhece o emissor', () => {
    const text = 'Banco Qualquer\n12/02 PADARIA CENTRAL R$ 18,00'
    const result = parseStatement(text, options)

    expect(result.parserId).toBe('generic')
    expect(result.transactions).toHaveLength(1)
  })

  it('cai no genérico quando o parser específico não acha nada', () => {
    const text = 'Nubank\n12/02 PADARIA CENTRAL R$ 18,00'
    const result = parseStatement(text, { ...options, preferredParserId: 'itau' })

    expect(result.transactions).toHaveLength(1)
  })

  it('extrai total e vencimento quando presentes', () => {
    const text = [
      'Banco Qualquer',
      'Vencimento: 10/03/2026',
      '12/02 PADARIA CENTRAL R$ 18,00',
      'TOTAL DA FATURA R$ 18,00',
    ].join('\n')

    const result = parseStatement(text, options)
    expect(result.totalAmount).toBe(18)
    expect(result.dueDate).toBe('2026-03-10')
  })

  it('selectParser respeita o emissor escolhido pelo usuário', () => {
    expect(selectParser('texto qualquer', 'itau').id).toBe('itau')
    expect(selectParser('texto qualquer', 'inexistente').id).toBe('generic')
  })
})

describe('isInvoicePayment', () => {
  it('reconhece pagamento da própria fatura', () => {
    expect(isInvoicePayment('PAGAMENTO DE FATURA')).toBe(true)
    expect(isInvoicePayment('Pagamento recebido')).toBe(true)
    expect(isInvoicePayment('PAGTO FATURA')).toBe(true)
    expect(isInvoicePayment('SALDO ANTERIOR')).toBe(true)
  })

  it('não confunde estorno de loja com pagamento da fatura', () => {
    // A diferença importa: estorno abate o gasto do mês, pagamento não —
    // pagar o cartão é transferência, não consumo.
    expect(isInvoicePayment('ESTORNO SHOPEE*62045670')).toBe(false)
    expect(isInvoicePayment('DEVOLUCAO MERCADOLIVRE')).toBe(false)
    expect(isInvoicePayment('MERCADO*MERCADOLIVRE SAO PAULO')).toBe(false)
    expect(isInvoicePayment('CASHBACK NUBANK')).toBe(false)
  })

  it('não captura compra que só menciona pagamento no nome', () => {
    expect(isInvoicePayment('PAGSEGURO PADARIA')).toBe(false)
    expect(isInvoicePayment('PAGUE MENOS FARMACIA')).toBe(false)
  })

  it('estorno continua sendo crédito, mesmo não sendo pagamento', () => {
    expect(isCreditDescription('ESTORNO SHOPEE')).toBe(true)
    expect(isInvoicePayment('ESTORNO SHOPEE')).toBe(false)
  })
})
