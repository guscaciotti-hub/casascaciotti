import { NextResponse } from 'next/server'
import { getInbox } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Estado do sininho, para ele se atualizar sozinho.
 *
 * Existe como rota, e não como `router.refresh()`, de propósito: recarregar a
 * página inteira a cada 30 segundos apagaria o que a pessoa está digitando na
 * planilha de contas. O sininho atualiza só a si mesmo.
 */
export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 })

  return NextResponse.json(await getInbox(user.id))
}
