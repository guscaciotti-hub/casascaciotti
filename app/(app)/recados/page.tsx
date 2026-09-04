import { redirect } from 'next/navigation'
import { PageContainer, PageHeader } from '@/components/page-header'
import { Chat } from '@/components/messages/chat'
import { getMessages } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recados · Casa Scaciotti' }

export default async function MessagesPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const messages = await getMessages()

  return (
    <PageContainer>
      <PageHeader
        title="Recados"
        description="A conversa da casa sobre dinheiro, guardada junto do resto."
      />

      <Chat messages={messages} currentUserId={user.id} />
    </PageContainer>
  )
}
