import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_ITEMS = 60

/**
 * Sugere nome amigável e categoria para lançamentos não identificados.
 *
 * A sugestão nunca é aplicada sozinha: volta para a tela de revisão apenas
 * pré-preenchendo os campos. Depois que o usuário confirma, a regra criada é
 * determinística e a IA nunca mais é chamada para aquele estabelecimento.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Defina ANTHROPIC_API_KEY para habilitar a sugestão por IA.' },
      { status: 501 },
    )
  }

  let body: { descriptions?: Array<{ id?: unknown; description?: unknown }> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 })
  }

  const items = (body.descriptions ?? [])
    .filter(
      (item): item is { id: string; description: string } =>
        typeof item?.id === 'string' && typeof item?.description === 'string',
    )
    .slice(0, MAX_ITEMS)

  if (items.length === 0) {
    return NextResponse.json({ suggestions: {} })
  }

  const { data: categories } = await supabase.from('categories').select('id, name').order('name')
  const categoryList = categories ?? []

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      // Classificação curta e objetiva — não precisa de raciocínio profundo.
      output_config: { effort: 'low' },
      system:
        'Você classifica lançamentos de fatura de cartão de crédito brasileira. ' +
        'Para cada descrição, devolva o nome comercial mais reconhecível do estabelecimento ' +
        'e a categoria mais provável dentre as fornecidas. ' +
        'Quando não tiver confiança, use a categoria "Não identificado". ' +
        'Responda apenas com JSON válido, sem texto ao redor.',
      messages: [
        {
          role: 'user',
          content: [
            'Categorias disponíveis (use exatamente estes nomes):',
            categoryList.map((category) => `- ${category.name}`).join('\n'),
            '',
            'Lançamentos:',
            JSON.stringify(items, null, 2),
            '',
            'Responda no formato:',
            '{"suggestions":[{"id":"<id>","merchantName":"<nome amigável>","category":"<nome exato da categoria>"}]}',
          ].join('\n'),
        },
      ],
    })

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')

    const parsed = parseSuggestions(text)
    const byName = new Map(categoryList.map((category) => [category.name.toLowerCase(), category.id]))

    const suggestions: Record<string, { merchantName: string; categoryId: string | null }> = {}
    for (const suggestion of parsed) {
      if (!items.some((item) => item.id === suggestion.id)) continue

      suggestions[suggestion.id] = {
        merchantName: suggestion.merchantName.slice(0, 80),
        categoryId: byName.get(suggestion.category.toLowerCase()) ?? null,
      }
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Não foi possível gerar as sugestões.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

interface RawSuggestion {
  id: string
  merchantName: string
  category: string
}

/** Extrai o JSON da resposta, tolerando cerca de markdown. */
function parseSuggestions(text: string): RawSuggestion[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) return []

  try {
    const payload = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(payload?.suggestions)) return []

    return payload.suggestions.filter(
      (item: unknown): item is RawSuggestion =>
        typeof (item as RawSuggestion)?.id === 'string' &&
        typeof (item as RawSuggestion)?.merchantName === 'string' &&
        typeof (item as RawSuggestion)?.category === 'string',
    )
  } catch {
    return []
  }
}
