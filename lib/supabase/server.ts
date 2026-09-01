import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env'

/**
 * Client Supabase para Server Components, Server Actions e Route Handlers.
 * A escrita de cookie falha silenciosamente em Server Component (é read-only);
 * o middleware é quem renova a sessão.
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Component: o middleware cuida da renovação.
          }
        },
      },
    },
  )
}
