import { describe, expect, it } from 'vitest'
import { sanitize } from '@/lib/supabase/env'

/**
 * A chave anônima vai em cabeçalho HTTP, que só aceita ASCII. Um caractere
 * invisível vindo do copiar/colar derruba o login com uma mensagem que não
 * aponta para a causa — daí o teste.
 */
describe('sanitize', () => {
  it('mantém uma chave JWT normal intacta', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc-DEF_123'
    expect(sanitize(jwt)).toBe(jwt)
  })

  it('mantém uma URL normal intacta', () => {
    expect(sanitize('https://abc.supabase.co')).toBe('https://abc.supabase.co')
  })

  it('remove espaços das bordas', () => {
    expect(sanitize('  chave  ')).toBe('chave')
  })

  it('remove quebra de linha colada junto', () => {
    expect(sanitize('chave\n')).toBe('chave')
    expect(sanitize('\nchave\r\n')).toBe('chave')
  })

  it('remove espaço não separável (U+00A0)', () => {
    expect(sanitize(' chave ')).toBe('chave')
  })

  it('remove aspas curvas e travessão do copiar/colar', () => {
    expect(sanitize('“chave”')).toBe('chave')
    expect(sanitize('chave—')).toBe('chave')
  })

  it('remove caractere de largura zero, que é invisível na tela', () => {
    expect(sanitize('cha​ve')).toBe('chave')
    expect(sanitize('﻿chave')).toBe('chave')
  })

  it('o resultado sempre cabe num cabeçalho HTTP (Latin-1)', () => {
    const sujo = '﻿ eyJhbGci​OiJIUzI1NiJ9. payload” \n'
    const limpo = sanitize(sujo)

    expect(() => new Headers({ apikey: limpo })).not.toThrow()
    expect([...limpo].every((char) => char.charCodeAt(0) <= 0x7e)).toBe(true)
  })

  it('trata undefined e vazio', () => {
    expect(sanitize(undefined)).toBe('')
    expect(sanitize('   ')).toBe('')
  })
})
