import { PageContainer, PageHeader } from '@/components/page-header'
import { CategoriesManager, NewCategoryDialog } from '@/components/categories/categories-manager'
import { getCategories } from '@/lib/queries'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Categorias · Casa Scaciotti' }

export default async function CategoriesPage() {
  const categories = await getCategories()

  return (
    <PageContainer>
      <PageHeader
        title="Categorias"
        description="Como o gasto da casa é agrupado nos gráficos e no resumo do mês."
        action={<NewCategoryDialog />}
      />

      <CategoriesManager categories={categories} />
    </PageContainer>
  )
}
