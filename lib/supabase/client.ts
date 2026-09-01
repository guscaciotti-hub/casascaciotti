'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env'

/** Client Supabase para componentes do browser. */
export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    supabaseAnonKey(),
  )
}
