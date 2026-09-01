import { describe, expect, it } from 'vitest'
import { sanitize } from '@/lib/supabase/env'

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc-DEF_123'
const PUBLISHABLE = 'sb_publishable_0e0ZpIB4jt7s-WVBzRi6pA_5OgAKdTZ'
const URL = 'https://abc.supabase.co'

/**
 * As duas variáveis são coladas à mão no painel da Vercel. Cada jeito de
 * errar o copiar/colar quebra de um jeito diferente e nenhum é visível
 * olhando o campo — daí o teste cobrir os quatro.
 */
describe('sanitize', () => {
  it('mantém intacto o que já está certo', () => {
    expect(sanitize(JWT)).toBe(JWT)
    expect(sanitize(PUBLISHABLE)).toBe(PUBLISHABLE)
    expect(sanitize(URL)).toBe(URL)
  })

  it('remove espaços das bordas', () => {
    expect(sanitize(`  ${JWT}  `)).toBe(JWT)
  })

  it('remove quebra de linha, inclusive no meio do valor', () => {
    expect(sanitize(`${JWT}\n`)).toBe(JWT)
    expect(sanitize('eyJhbGciOiJIUzI1NiJ9.\neyJyb2xlIjoiYW5vbiJ9.abc-DEF_123')).toBe(JWT)
  })

  it('remove espaço no meio, de valor embrulhado na tela', () => {
    expect(sanitize('eyJhbGciOiJIUzI1NiJ9. eyJyb2xlIjoiYW5vbiJ9.abc-DEF_123')).toBe(JWT)
  })

  it('remove caractere invisível: NBSP, largura zero e BOM', () => {
    expect(sanitize(` ${JWT} `)).toBe(JWT)
    expect(sanitize(`eyJhbGciOiJIUzI1NiJ9.​eyJyb2xlIjoiYW5vbiJ9.abc-DEF_123`)).toBe(JWT)
    expect(sanitize(`﻿${JWT}`)).toBe(JWT)
  })

  it('remove aspas em volta, copiadas de um exemplo', () => {
    expect(sanitize(`"${JWT}"`)).toBe(JWT)
    expect(sanitize(`'${PUBLISHABLE}'`)).toBe(PUBLISHABLE)
    expect(sanitize(`"${URL}"`)).toBe(URL)
  })

  it('remove o nome da variável, quando se cola a linha inteira', () => {
    expect(sanitize(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${JWT}`)).toBe(JWT)
    expect(sanitize(`NEXT_PUBLIC_SUPABASE_URL = ${URL}`)).toBe(URL)
    expect(sanitize(`NEXT_PUBLIC_SUPABASE_ANON_KEY="${JWT}"`)).toBe(JWT)
  })

  it('não come uma aspa que faça parte do valor', () => {
    // Só corta quando abre e fecha com a mesma aspa.
    expect(sanitize(`"${JWT}`)).toBe(`"${JWT}`)
  })

  it('o resultado sempre cabe num cabeçalho HTTP (Latin-1)', () => {
    const sujo = `﻿ "eyJhbGci​OiJIUzI1NiJ9. payload” \n`
    const limpo = sanitize(sujo)

    expect(() => new Headers({ apikey: limpo })).not.toThrow()
    expect([...limpo].every((char) => char.charCodeAt(0) <= 0x7e)).toBe(true)
  })

  it('trata undefined e vazio', () => {
    expect(sanitize(undefined)).toBe('')
    expect(sanitize('   ')).toBe('')
  })
})
