import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { parseStatement } from '@/lib/parsers'
import { normalizeDescription } from '@/lib/normalize'
import { dedupeHash } from '@/lib/hash'

const require = createRequire(import.meta.url)
// Mesmo caminho de import usado em `lib/pdf.ts` — o `index.js` do pacote roda
// um bloco de debug que lê um PDF de teste do disco.
const pdfParse = require('pdf-parse/lib/pdf-parse.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(here, 'fixtures', 'fatura-exemplo.pdf')

/**
 * Teste de ponta a ponta do caminho crítico: PDF de verdade -> texto ->
 * lançamentos -> descrição normalizada -> hash de deduplicação.
 *
 * O fixture é um PDF de fatura fictícia no layout do Nubank
 * (`fixtures/fatura-exemplo.html` é a fonte que o gerou).
 */
describe('pipeline de importação sobre um PDF real', () => {
  it('extrai o texto do PDF', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))

    expect(text).toContain('Nubank')
    expect(text).toContain('R$ 1.850,00')
  })

  it('roteia para o parser do Nubank e lê todos os lançamentos', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))
    const result = parseStatement(text, { referenceMonth: '2026-03-01' })

    expect(result.parserId).toBe('nubank')
    expect(result.totalAmount).toBe(2068.3)
    expect(result.transactions).toHaveLength(5)
    expect(result.transactions[0].date).toBe('2026-03-14')
  })

  it('descarta o bloco de limites', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))
    const result = parseStatement(text, { referenceMonth: '2026-03-01' })

    expect(
      result.transactions.some((transaction) => /LIMITE/i.test(transaction.description)),
    ).toBe(false)
  })

  it('normaliza as descrições para a forma usada na categorização', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))
    const result = parseStatement(text, { referenceMonth: '2026-03-01' })

    const normalized = result.transactions.map((transaction) =>
      normalizeDescription(transaction.description),
    )

    // Prefixo de gateway, sufixo societário e UF saem; o nome fica.
    expect(normalized).toContain('PASQUALI COM ALIM SAO PAULO')
    expect(normalized).toContain('RESTAURANTE DA ESQUINA')
    // Marcador de parcela sai do texto.
    expect(normalized).toContain('MAGAZINE LUIZA')
  })

  it('marca estorno como valor negativo', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))
    const result = parseStatement(text, { referenceMonth: '2026-03-01' })

    const estorno = result.transactions.find((transaction) =>
      /ESTORNO/i.test(transaction.description),
    )
    expect(estorno?.amount).toBe(-24.9)
  })

  it('captura a parcela', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))
    const result = parseStatement(text, { referenceMonth: '2026-03-01' })

    const parcelado = result.transactions.find((transaction) => transaction.installmentTotal)
    expect(parcelado).toMatchObject({ installmentCurrent: 2, installmentTotal: 6 })
  })

  it('gera hashes distintos por lançamento e estáveis entre importações', async () => {
    const { text } = await pdfParse(fs.readFileSync(FIXTURE))
    const result = parseStatement(text, { referenceMonth: '2026-03-01' })

    const hash = (transaction: (typeof result.transactions)[number]) =>
      dedupeHash({
        source: 'nubank',
        transactionDate: transaction.date,
        rawDescription: transaction.description,
        amount: transaction.amount,
      })

    const hashes = result.transactions.map(hash)

    expect(new Set(hashes).size).toBe(hashes.length)
    // Reimportar o mesmo PDF produz exatamente os mesmos hashes.
    expect(result.transactions.map(hash)).toEqual(hashes)
  })
})
