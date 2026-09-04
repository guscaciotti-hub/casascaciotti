import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { getInbox, getNickname } from '@/lib/queries'
import { emailToUsername } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const username = emailToUsername(user.email)
  const [inbox, nickname] = await Promise.all([getInbox(user.id), getNickname(username)])

  return (
    <AppShell username={username} inbox={inbox} nickname={nickname}>
      {children}
    </AppShell>
  )
}
