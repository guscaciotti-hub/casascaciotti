/** Tipos de domínio do Casa Scaciotti — espelham o schema do Supabase. */

export type MatchType = 'exact' | 'contains' | 'regex'

export interface Category {
  id: string
  name: string
  color: string
  icon: string
  monthly_budget: number | null
  is_essential: boolean
  created_at: string
}

export interface Merchant {
  id: string
  display_name: string
  category_id: string | null
  notes: string | null
  created_at: string
}

export interface MerchantRule {
  id: string
  merchant_id: string
  pattern: string
  match_type: MatchType
  priority: number
  active: boolean
  created_at: string
}

export interface Statement {
  id: string
  source: string
  reference_month: string
  file_name: string | null
  file_url: string | null
  total_amount: number | null
  due_date: string | null
  imported_at: string
  imported_by: string | null
}

export interface Transaction {
  id: string
  statement_id: string | null
  transaction_date: string
  raw_description: string
  normalized_description: string
  amount: number
  installment_current: number | null
  installment_total: number | null
  merchant_id: string | null
  category_id: string | null
  is_reviewed: boolean
  dedupe_hash: string
  notes: string | null
  created_at: string
}

export interface FixedBill {
  id: string
  name: string
  amount: number
  due_day: number
  category_id: string | null
  is_autopay: boolean
  is_active: boolean
  notes: string | null
  created_at: string
  /** Posição da linha na planilha de contas. */
  sort_order: number
}

export interface BillPayment {
  id: string
  fixed_bill_id: string
  reference_month: string
  is_paid: boolean
  paid_at: string | null
  /** Total efetivamente pago no mês, já incluindo juros. */
  amount_paid: number | null
  /** Parcela de juros dentro de `amount_paid`. Nulo quando pago em dia. */
  interest_paid: number | null
  /** Coluna "Valor" da planilha: o previsto do mês. */
  amount_due: number | null
  /** Coluna "Parcela". Texto livre: "9/12", "-", vazio. */
  installment: string | null
  /** Coluna "Vencimento" do mês. Sobrepõe `fixed_bills.due_day`. */
  due_date: string | null
  /** Coluna "Quem?". */
  paid_by: string | null
  /** Coluna "Pago em:". */
  paid_on: string | null
  /** Coluna "Observações". */
  notes: string | null
}

export interface SavingsAccount {
  id: string
  name: string
  institution: string | null
  goal_amount: number | null
  current_balance: number
  updated_at: string
}

export interface SavingsSnapshot {
  id: string
  savings_account_id: string
  balance: number
  snapshot_date: string
  created_at: string
}

/** Transação com os relacionamentos já resolvidos, como as telas consomem. */
export interface TransactionWithRelations extends Transaction {
  category: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null
  merchant: Pick<Merchant, 'id' | 'display_name'> | null
  statement: Pick<Statement, 'id' | 'source' | 'reference_month'> | null
}

/** Nome da categoria de fallback. Referenciado em código e no seed. */
export const UNCATEGORIZED = 'Não identificado'

/** Recado da casa. Duas pessoas, uma conversa só. */
export interface Message {
  id: string
  author_id: string
  author_name: string
  body: string
  /** `true` quando é um pedido — fica pendente até alguém marcar como feito. */
  is_request: boolean
  done_at: string | null
  created_at: string
}

/** O que o sininho precisa saber. */
export interface Inbox {
  /** Mensagens da outra pessoa desde a última vez que esta abriu a conversa. */
  unread: number
  /** Pedidos ainda em aberto, de quem quer que seja. */
  pendingRequests: Message[]
  /** As últimas mensagens, para o sininho mostrar sem sair da tela. */
  recent: Message[]
}
