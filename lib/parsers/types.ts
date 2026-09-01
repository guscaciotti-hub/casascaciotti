/** Contrato dos parsers de fatura. Ver README para adicionar um banco novo. */

export interface ParsedTransaction {
  /** Data do lançamento em ISO (`YYYY-MM-DD`). */
  date: string
  /** Descrição exatamente como veio no PDF. */
  description: string
  /**
   * Valor em reais. Positivo é despesa; negativo é estorno, crédito ou
   * pagamento da fatura — o dashboard nunca soma negativo como gasto.
   */
  amount: number
  installmentCurrent?: number
  installmentTotal?: number
}

export interface ParseOptions {
  /**
   * Mês de referência da fatura (`YYYY-MM-01`). Usado para inferir o ano dos
   * lançamentos, já que a maioria dos bancos imprime só `DD/MM`.
   */
  referenceMonth: string
}

export interface StatementParser {
  /** Identificador estável, usado como `statements.source` padrão. */
  id: string
  /** Nome exibido na interface. */
  label: string
  /** Procura a assinatura do emissor no texto extraído do PDF. */
  detect: (text: string) => boolean
  /** Extrai os lançamentos. Deve devolver `[]` quando não reconhece nada. */
  parse: (text: string, options: ParseOptions) => ParsedTransaction[]
}

export interface ParseResult {
  parserId: string
  parserLabel: string
  transactions: ParsedTransaction[]
  /** Total da fatura, quando o parser consegue lê-lo do documento. */
  totalAmount: number | null
  /** Vencimento em ISO, quando presente no documento. */
  dueDate: string | null
}
