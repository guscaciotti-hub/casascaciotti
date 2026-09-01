import { PageContainer, PageHeader } from '@/components/page-header'
import {
  MerchantsManager,
  NewMerchantDialog,
  type MerchantWithRules,
} from '@/components/merchants/merchants-manager'
import { getCategories, getMerchantRules, getMerchants } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Estabelecimentos · Casa Scaciotti' }

export default async function MerchantsPage() {
  const [merchants, rules, categories, counts] = await Promise.all([
    getMerchants(),
    getMerchantRules(),
    getCategories(),
    countTransactionsByMerchant(),
  ])

  const data: MerchantWithRules[] = merchants.map((merchant) => ({
    merchant,
    rules: rules.filter((rule) => rule.merchant_id === merchant.id),
    transactionCount: counts.get(merchant.id) ?? 0,
  }))

  return (
    <PageContainer>
      <PageHeader
        title="Estabelecimentos"
        description="Cada estabelecimento tem um ou mais padrões de correspondência. É o que faz a mesma razão social cair sempre na mesma categoria."
        action={merchants.length > 0 ? <NewMerchantDialog categories={categories} /> : undefined}
      />

      <MerchantsManager merchants={data} categories={categories} />
    </PageContainer>
  )
}

/** Quantos lançamentos cada estabelecimento acumula no histórico. */
async function countTransactionsByMerchant(): Promise<Map<string, number>> {
  const supabase = createClient()
  const { data } = await supabase.from('transactions').select('merchant_id').not('merchant_id', 'is', null)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    if (!row.merchant_id) continue
    counts.set(row.merchant_id, (counts.get(row.merchant_id) ?? 0) + 1)
  }

  return counts
}
