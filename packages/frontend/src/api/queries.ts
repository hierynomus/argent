import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { getAccounts } from "./accounts"
import { getAdminAccounts, getAdminSharing } from "./admin"
import { getCategories } from "./categories"
import { debtApis, type Debt } from "./debts"
import { queryKeys, type DebtKind, type PortfolioKind } from "./keys"
import { getMe } from "./me"
import { portfolioApis, type PortfolioDetailByKind } from "./portfolios"
import { getSubscriptions, getSubscriptionTransactions } from "./subscriptions"
import { getTransactions, getTransferSuggestions, type TransactionQuery } from "./transactions"

/**
 * Read hooks. Pages never write `useQuery({ queryKey, queryFn })` themselves, so a resource has
 * exactly one key and one fetcher — and `useInvalidate` below knows how to refresh it.
 *
 * Authentication is guaranteed by the route guard, so there is no `enabled: !!token` dance.
 */
export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: getMe })
export const useAccounts = () => useQuery({ queryKey: queryKeys.accounts, queryFn: getAccounts })
export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: getCategories })
export const useSubscriptions = () => useQuery({ queryKey: queryKeys.subscriptions, queryFn: getSubscriptions })
type Enabled = { enabled?: boolean }
/** The transactions linked to one subscription; only fetched once `enabled` (e.g. the row is expanded). */
export const useSubscriptionTransactions = (id: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.subscriptionTransactions(id), queryFn: () => getSubscriptionTransactions(id), enabled })

export const useAdminAccounts = (options: Enabled = {}) => useQuery({ queryKey: queryKeys.adminAccounts, queryFn: getAdminAccounts, ...options })
export const useAdminSharing = (options: Enabled = {}) => useQuery({ queryKey: queryKeys.adminSharing, queryFn: getAdminSharing, ...options })

export const useTransactions = (filters: TransactionQuery, options: Enabled = {}) =>
  useQuery({ queryKey: queryKeys.transactionList(filters), queryFn: () => getTransactions(filters), ...options })

/** The N most recent transactions (optionally of one account). */
export const useRecentTransactions = (pageSize: number, accountId?: string) =>
  useQuery({
    queryKey: [...queryKeys.transactionsRecent(accountId), pageSize],
    queryFn: () => getTransactions({ pageSize, ...(accountId ? { accountIds: [accountId] } : {}) }),
  })

/** Possible other legs of a transfer for one transaction; fetched once `enabled` (the link panel is open). */
export const useTransferSuggestions = (id: string, enabled: boolean) =>
  useQuery({ queryKey: queryKeys.transferSuggestions(id), queryFn: () => getTransferSuggestions(id), enabled })

/** Every transaction in a date range (used for monthly summaries). */
export const useTransactionsBetween = (yearMonth: string, from: string, to: string) =>
  useQuery({ queryKey: queryKeys.transactionsMonth(yearMonth), queryFn: () => getTransactions({ from, to, pageSize: 500 }) })

export const usePortfolios = (kind: PortfolioKind) =>
  useQuery({ queryKey: queryKeys.portfolios(kind), queryFn: portfolioApis[kind].list })

export function usePortfolio<K extends PortfolioKind>(kind: K, id: string | null) {
  return useQuery<PortfolioDetailByKind[K]>({
    queryKey: queryKeys.portfolio(kind, id),
    queryFn: () => portfolioApis[kind].get(id!) as Promise<PortfolioDetailByKind[K]>,
    enabled: !!id,
  })
}

/** Details of several portfolios of one kind in parallel (shares cache entries with `usePortfolio`). */
export function usePortfolioDetails<K extends PortfolioKind>(kind: K, portfolios: Array<{ id: string }>) {
  return useQueries({
    queries: portfolios.map((p) => ({
      queryKey: queryKeys.portfolio(kind, p.id),
      queryFn: () => portfolioApis[kind].get(p.id) as Promise<PortfolioDetailByKind[K]>,
    })),
  })
}

export const useDebts = (kind: DebtKind) =>
  useQuery<Debt[]>({ queryKey: queryKeys.debts(kind), queryFn: debtApis[kind].list })

/** Cache refreshers, named for what changed. Prefix keys mean one call refreshes every dependent view. */
export function useInvalidate() {
  const qc = useQueryClient()
  return {
    accounts: () => qc.invalidateQueries({ queryKey: queryKeys.accounts }),
    categories: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
    subscriptions: () => qc.invalidateQueries({ queryKey: queryKeys.subscriptions }),
    transactions: () => qc.invalidateQueries({ queryKey: queryKeys.transactions }),
    me: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
    /** the portfolio list and every portfolio's detail of this kind */
    portfolios: (kind: PortfolioKind) => qc.invalidateQueries({ queryKey: queryKeys.portfolios(kind) }),
    debts: (kind: DebtKind) => qc.invalidateQueries({ queryKey: queryKeys.debts(kind) }),
    admin: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    /** everything — after the whole database was replaced (restore) */
    everything: () => qc.invalidateQueries(),
    /** after an import: everything derived from transactions and accounts */
    afterImport: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.accounts }),
        qc.invalidateQueries({ queryKey: queryKeys.transactions }),
        qc.invalidateQueries({ queryKey: queryKeys.subscriptions }),
      ]),
  }
}
