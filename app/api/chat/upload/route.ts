import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Teto por arquivo. Fatura em PDF e foto de conta cabem folgado. */
const MAX_BYTES = 15 * 1024 * 1024

/**
 * Sobe um anexo do chat.
 *
 * O bucket é privado: aqui só guarda o arquivo e devolve a chave. A URL é
 * assinada na leitura da conversa, e vence sozinha — fatura de cartão não é
 * coisa para ficar em link público adivinhável.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Nenhum arquivo recebido.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Arquivo grande demais. O limite é ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    )
  }

  // O nome original vai para o banco; a chave no bucket é sorteada, para dois
  // "fatura.pdf" não brigarem e para o nome não virar parte de uma URL.
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}${extension}`

  const { error } = await supabase.storage
    .from('chat')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })

  if (error) {
    return NextResponse.json({ error: `Não foi possível anexar: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    path,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
  })
}
