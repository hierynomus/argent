import type { TransactionFilters } from "@argent/shared"

export type PortfolioKind = "crypto" | "metals" | "stocks"
export type DebtKind = "mortgages" | "loans"

/**
 * Every React Query key in the app, in one place.
 *
 * Keys are hierarchical so prefix invalidation does the right thing:
 * invalidating `["transactions"]` refreshes every transaction list/summary,
 * `["portfolios", "crypto"]` the crypto list *and* all crypto portfolio details, etc.
 */
export const queryKeys = {
  me: ["me"] as const,
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  subscriptions: ["subscriptions"] as const,
  /** nested under `subscriptions`, so refreshing subscriptions refreshes these too */
  subscriptionTransactions: (id: string) => ["subscriptions", id, "transactions"] as const,

  transactions: ["transactions"] as const,
  transactionList: (filters: TransactionFilters & { accountIds?: string[] }) => ["transactions", "list", filters] as const,
  transactionsRecent: (accountId?: string) => ["transactions", "recent", accountId ?? null] as const,
  /** candidate peers for linking a transfer (nested under `transactions`: stale as soon as any transaction changes) */
  transferSuggestions: (id: string) => ["transactions", "suggestions", id] as const,
  transactionsMonth: (yearMonth: string) => ["transactions", "month", yearMonth] as const,

  portfolios: (kind: PortfolioKind) => ["portfolios", kind] as const,
  portfolio: (kind: PortfolioKind, id: string | null) => ["portfolios", kind, id] as const,

  /** price history of one asset: its own prefix, so portfolio refreshes don't refetch it */
  assetHistory: (kind: "crypto" | "stocks", symbol: string, currency: string, range: string) => ["history", kind, symbol, currency, range] as const,

  debts: (kind: DebtKind) => ["debts", kind] as const,

  adminAccounts: ["admin", "accounts"] as const,
  adminSharing: ["admin", "sharing"] as const,
}
