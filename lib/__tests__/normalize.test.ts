import { describe, expect, it } from 'vitest'
import {
  extractInstallment,
  normalizeDescription,
  stripAccents,
  suggestPattern,
} from '@/lib/normalize'

describe('stripAccents', () => {
  it('remove acentuação preservando as letras', () => {
    expect(stripAccents('Farmácia São João')).toBe('Farmacia Sao Joao')
    expect(stripAccents('AÇÃO ÜBER')).toBe('ACAO UBER')
  })
})

describe('normalizeDescription', () => {
  it('coloca em maiúsculas e remove acento', () => {
    expect(normalizeDescription('Farmácia São João')).toBe('FARMACIA SAO JOAO')
  })

  it('remove prefixo de adquirente', () => {
    expect(normalizeDescription('PAG*PASQUALI')).toBe('PASQUALI')
    expect(normalizeDescription('PAGS*PADARIA CENTRAL')).toBe('PADARIA CENTRAL')
    expect(normalizeDescription('MP*LOJADOZE')).toBe('LOJADOZE')
    expect(normalizeDescription('MERCPAGO*BAR DO ZE')).toBe('BAR DO ZE')
    expect(normalizeDescription('PP*SPOTIFY')).toBe('SPOTIFY')
    expect(normalizeDescription('IFD*RESTAURANTE')).toBe('RESTAURANTE')
    expect(normalizeDescription('EC*ESTACIONAMENTO')).toBe('ESTACIONAMENTO')
    expect(normalizeDescription('APPLE.COM/BILL*ICLOUD')).toBe('ICLOUD')
  })

  it('remove prefixos encadeados', () => {
    expect(normalizeDescription('PAG*MP*PADARIA')).toBe('PADARIA')
  })

  it('não come palavras que apenas começam com as mesmas letras', () => {
    expect(normalizeDescription('MPADARIA DO BAIRRO')).toBe('MPADARIA DO BAIRRO')
    expect(normalizeDescription('ECONOMIA LIMPEZA')).toBe('ECONOMIA LIMPEZA')
    expect(normalizeDescription('PAGUE MENOS')).toBe('PAGUE MENOS')
  })

  it('remove sufixo de cidade/UF quando a sigla é uma UF real', () => {
    expect(normalizeDescription('SUPERMERCADO BOM DIA SAO PAULO SP')).toBe(
      'SUPERMERCADO BOM DIA SAO PAULO',
    )
    expect(normalizeDescription('POSTO IPIRANGA RJ')).toBe('POSTO IPIRANGA')
  })

  it('preserva sigla final que não é UF', () => {
    expect(normalizeDescription('SPOTIFY BR')).toBe('SPOTIFY BR')
    expect(normalizeDescription('NETFLIX COM')).toBe('NETFLIX COM')
  })

  it('remove marcador de parcela do texto', () => {
    expect(normalizeDescription('MAGAZINE LUIZA 3/10')).toBe('MAGAZINE LUIZA')
    expect(normalizeDescription('MAGAZINE LUIZA PARC 3/10')).toBe('MAGAZINE LUIZA')
    expect(normalizeDescription('MAGAZINE LUIZA (3 de 10)')).toBe('MAGAZINE LUIZA')
    expect(normalizeDescription('MAGAZINE LUIZA PARCELA 03 DE 10')).toBe('MAGAZINE LUIZA')
  })

  it('remove parcela e UF na mesma descrição', () => {
    expect(normalizeDescription('Casas Bahia 2/12 Campinas SP')).toBe('CASAS BAHIA CAMPINAS')
  })

  it('remove sufixo societário', () => {
    expect(normalizeDescription('PASQUALI COM ALIM LTDA')).toBe('PASQUALI COM ALIM')
    expect(normalizeDescription('DROGARIA CENTRAL EIRELI')).toBe('DROGARIA CENTRAL')
  })

  it('colapsa espaços múltiplos e apara pontuação de borda', () => {
    expect(normalizeDescription('  UBER   *TRIP  ')).toBe('UBER *TRIP')
    expect(normalizeDescription('*** IFOOD ***')).toBe('IFOOD')
  })

  it('é idempotente — normalizar duas vezes dá o mesmo resultado', () => {
    const samples = [
      'PAG*PASQUALI COM ALIM LTDA SAO PAULO SP',
      'Magazine Luiza 3/10 Campinas SP',
      'IFD*RESTAURANTE DA ESQUINA RJ',
    ]
    for (const sample of samples) {
      const once = normalizeDescription(sample)
      expect(normalizeDescription(once)).toBe(once)
    }
  })

  it('trata entrada vazia sem quebrar', () => {
    expect(normalizeDescription('')).toBe('')
    expect(normalizeDescription('   ')).toBe('')
  })

  it('mantém a mesma razão social estável entre meses', () => {
    const marco = normalizeDescription('PAG*PASQUALI COM ALIM LTDA SAO PAULO SP')
    const abril = normalizeDescription('Pag*Pasquali Com Alim Ltda   Sao Paulo  SP')
    expect(marco).toBe(abril)
  })
})

describe('extractInstallment', () => {
  it('captura os dois números em todos os formatos comuns', () => {
    expect(extractInstallment('MAGAZINE LUIZA 3/10')).toEqual({ current: 3, total: 10 })
    expect(extractInstallment('MAGAZINE LUIZA PARC 3/10')).toEqual({ current: 3, total: 10 })
    expect(extractInstallment('MAGAZINE LUIZA (3 de 10)')).toEqual({ current: 3, total: 10 })
    expect(extractInstallment('MAGAZINE LUIZA PARCELA 03 DE 10')).toEqual({ current: 3, total: 10 })
    expect(extractInstallment('Compra 1 de 2')).toEqual({ current: 1, total: 2 })
  })

  it('devolve null quando não há parcela', () => {
    expect(extractInstallment('SUPERMERCADO BOM DIA')).toBeNull()
    expect(extractInstallment('POSTO 24 HORAS')).toBeNull()
  })

  it('rejeita combinações impossíveis', () => {
    expect(extractInstallment('LOJA 11/10')).toBeNull()
    expect(extractInstallment('LOJA 0/10')).toBeNull()
    expect(extractInstallment('LOJA 1/1')).toBeNull()
  })

  it('não confunde data com parcela quando o total é implausível', () => {
    expect(extractInstallment('SEGURO 2/99')).toBeNull()
  })
})

describe('suggestPattern', () => {
  it('mantém o trecho estável do começo', () => {
    expect(suggestPattern('PASQUALI COM ALIM')).toBe('PASQUALI COM ALIM')
    expect(suggestPattern('SUPERMERCADO BOM DIA CENTRO')).toBe('SUPERMERCADO BOM DIA')
  })

  it('corta no primeiro código de loja', () => {
    expect(suggestPattern('DROGARIA SP 1234')).toBe('DROGARIA SP')
    expect(suggestPattern('POSTO SHELL L4523 CENTRO')).toBe('POSTO SHELL')
  })

  it('cai para a descrição inteira quando o começo é curto demais', () => {
    expect(suggestPattern('99 APP')).toBe('99 APP')
  })

  it('trata entrada vazia', () => {
    expect(suggestPattern('')).toBe('')
  })
})
