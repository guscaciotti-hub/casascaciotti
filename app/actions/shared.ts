import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** Resultado padrão das Server Actions — nunca lança para o client. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string }

export function ok(): ActionResult
export function ok<T>(data: T): ActionResult<T>
export function ok<T>(data?: T) {
  return { ok: true as const, data }
}

export function fail(error: string): ActionResult<never> {
  return { ok: false as const, error }
}

/**
 * Client Supabase autenticado. Toda Server Action passa por aqui — o RLS já
 * garante o acesso, mas negar cedo dá uma mensagem melhor que erro de policy.
 */
export async function requireClient() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Sessão expirada. Entre novamente.')

  return { supabase, user }
}

/** Converte erro desconhecido em mensagem legível. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Não foi possível concluir a operação.'
}
