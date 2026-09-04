import { NextResponse } from 'next/server'
import { getMessages } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A conversa, para ela se atualizar sozinha.
 *
 * Existe como rota, e não como `router.refresh()`, porque recarregar a página
 * a cada poucos segundos apagaria o rascunho no campo de escrever.
 */
export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })

  return NextResponse.json({ messages: await getMessages() })
}
