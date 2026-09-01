import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { importStatement } from '@/lib/import-statement'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILE_BYTES = 15 * 1024 * 1024

/**
 * Importa uma fatura em PDF.
 *
 * Route Handler (e não Server Action) porque o corpo é um arquivo e queremos
 * o limite de tamanho e o `Content-Type` validados antes de qualquer parse.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 })
  }

  const file = formData.get('file')
  const source = String(formData.get('source') ?? '').trim()
  const referenceMonth = String(formData.get('referenceMonth') ?? '').trim()

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Selecione o PDF da fatura.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'O arquivo enviado está vazio.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'O PDF precisa ter no máximo 15 MB.' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Envie o arquivo em PDF.' }, { status: 400 })
  }
  if (!source) {
    return NextResponse.json({ error: 'Escolha o banco de origem.' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-01$/.test(referenceMonth)) {
    return NextResponse.json({ error: 'Escolha o mês de referência.' }, { status: 400 })
  }

  try {
    const summary = await importStatement(supabase, {
      file,
      source,
      referenceMonth,
      userId: user.id,
    })

    return NextResponse.json(summary)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Não foi possível importar a fatura.'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
