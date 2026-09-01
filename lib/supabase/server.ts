import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * Client Supabase para Server Components, Server Actions e Route Handlers.
 * A escrita de cookie falha silenciosamente em Server Component (é read-only);
 * o middleware é quem renova a sessão.
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
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
