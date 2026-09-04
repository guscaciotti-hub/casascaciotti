import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { getInbox } from '@/lib/queries'
import { emailToUsername } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const inbox = await getInbox(user.id)

  return (
    <AppShell username={emailToUsername(user.email)} inbox={inbox}>
      {children}
    </AppShell>
  )
}
