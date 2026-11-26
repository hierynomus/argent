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
  localSettings: ["local", "settings"] as const,
  lockStatus: ["local", "lock"] as const,
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
  /** nested under `transactions`: any import, edit or delete refreshes the chart */
  balanceHistory: (accountId: string) => ["transactions", "balance-history", accountId] as const,
  transactionsMonth: (yearMonth: string) => ["transactions", "month", yearMonth] as const,

  portfolios: (kind: PortfolioKind) => ["portfolios", kind] as const,
  portfolio: (kind: PortfolioKind, id: string | null) => ["portfolios", kind, id] as const,

  /** price history of one asset: its own prefix, so portfolio refreshes don't refetch it */
  assetHistory: (kind: "crypto" | "stocks", symbol: string, currency: string, range: string) => ["history", kind, symbol, currency, range] as const,

  /** every equity plan with its grants (and their vesting state) and share prices */
  equity: ["equity"] as const,

  /** every pension plan with its statements, state and transfers */
  pensions: ["pensions"] as const,

  /** every property with its valuations, linked liabilities, debt and equity */
  properties: ["properties"] as const,

  debts: (kind: DebtKind) => ["debts", kind] as const,
  /** the balance of a debt over its life (under `debts`: a part, rate or extra payment changing refreshes it) */
  debtSchedule: (kind: DebtKind, debtId: string) => ["debts", kind, "schedule", debtId] as const,
  /** what is left of a part on a day (under `debts`: saving or closing a part refreshes it) */
  debtCarryOver: (kind: DebtKind, debtId: string, partId: string, date: string) => ["debts", kind, "carry-over", debtId, partId, date] as const,
  /** the preview of a part being entered (not under `debts`: it is not data, saving a part must not refresh it) */
  debtPartPreview: (kind: DebtKind, body: object) => ["debtPartPreview", kind, body] as const,

  adminAccounts: ["admin", "accounts"] as const,
  adminSharing: ["admin", "sharing"] as const,
}
