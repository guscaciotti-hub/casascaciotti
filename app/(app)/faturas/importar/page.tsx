import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/page-header'
import { UploadForm } from '@/components/statements/upload-form'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Importar fatura · Casa Scaciotti' }

export default function ImportStatementPage() {
  return (
    <PageContainer className="max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/faturas">
          <ArrowLeft className="h-4 w-4" />
          Faturas
        </Link>
      </Button>

      <PageHeader
        title="Importar fatura"
        description="O PDF é lido no servidor: cada lançamento vira uma linha, já agrupada pela categoria do estabelecimento."
      />

      <UploadForm />
    </PageContainer>
  )
}
