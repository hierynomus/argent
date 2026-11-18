import { computed, toValue, type MaybeRefOrGetter } from "vue"
import { useQueries, useQuery, useQueryClient } from "@tanstack/vue-query"
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
 * Read composables. Components never write `useQuery({ queryKey, queryFn })` themselves, so a resource
 * has exactly one key and one fetcher — and `useInvalidate` below knows how to refresh it.
 *
 * Parameters can be plain values, refs or getters; the query re-runs when a reactive one changes.
 *
 * IMPORTANT: a `queryFn` must take its parameters from its own `queryKey` (the context argument), never
 * from the reactive source. A cached entry can be refetched at any moment (e.g. by an invalidation) after
 * the reactive value has moved on to something else; reading the live value would then store the data of
 * the *new* selection under the *old* entry's key (this once emptied the first portfolio after a second
 * one was created).
 * Authentication is guaranteed by the route guard, so there is no `enabled: !!token` dance.
 */
type Enabled = { enabled?: MaybeRefOrGetter<boolean> }
const enabledOf = (o: Enabled) => computed(() => (o.enabled === undefined ? true : toValue(o.enabled)))

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: getMe })
export const useAccounts = () => useQuery({ queryKey: queryKeys.accounts, queryFn: getAccounts })
export const useCategories = () => useQuery({ queryKey: queryKeys.categories, queryFn: getCategories })
export const useSubscriptions = () => useQuery({ queryKey: queryKeys.subscriptions, queryFn: getSubscriptions })

/** The transactions linked to one subscription; only fetched once `enabled` (e.g. the row is expanded). */
export const useSubscriptionTransactions = (id: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean>) =>
  useQuery({
    queryKey: computed(() => queryKeys.subscriptionTransactions(toValue(id))),
    queryFn: ({ queryKey }) => getSubscriptionTransactions(queryKey[1] as string),
    enabled: computed(() => toValue(enabled)),
  })

export const useAdminAccounts = (options: Enabled = {}) => useQuery({ queryKey: queryKeys.adminAccounts, queryFn: getAdminAccounts, enabled: enabledOf(options) })
export const useAdminSharing = (options: Enabled = {}) => useQuery({ queryKey: queryKeys.adminSharing, queryFn: getAdminSharing, enabled: enabledOf(options) })

export const useTransactions = (filters: MaybeRefOrGetter<TransactionQuery>, options: Enabled = {}) =>
  useQuery({
    queryKey: computed(() => queryKeys.transactionList(toValue(filters))),
    queryFn: ({ queryKey }) => getTransactions(queryKey[2] as TransactionQuery),
    enabled: enabledOf(options),
  })

/** Possible other legs of a transfer for one transaction; fetched once `enabled` (the link panel is open). */
export const useTransferSuggestions = (id: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean>) =>
  useQuery({
    queryKey: computed(() => queryKeys.transferSuggestions(toValue(id))),
    queryFn: ({ queryKey }) => getTransferSuggestions(queryKey[2] as string),
    enabled: computed(() => toValue(enabled)),
  })

/** The N most recent transactions (optionally of one account). */
export const useRecentTransactions = (pageSize: number, accountId?: MaybeRefOrGetter<string | undefined>) =>
  useQuery({
    queryKey: computed(() => [...queryKeys.transactionsRecent(toValue(accountId)), pageSize]),
    queryFn: ({ queryKey }) => {
      const id = queryKey[2] as string | null
      return getTransactions({ pageSize: queryKey[3] as number, ...(id ? { accountIds: [id] } : {}) })
    },
  })

/** Every transaction in a date range (used for monthly summaries). */
export const useTransactionsBetween = (yearMonth: string, from: string, to: string) =>
  useQuery({ queryKey: queryKeys.transactionsMonth(yearMonth), queryFn: () => getTransactions({ from, to, pageSize: 500 }) })

export const usePortfolios = (kind: PortfolioKind) => useQuery({ queryKey: queryKeys.portfolios(kind), queryFn: portfolioApis[kind].list })

export function usePortfolio<K extends PortfolioKind>(kind: K, id: MaybeRefOrGetter<string | null>) {
  return useQuery<PortfolioDetailByKind[K]>({
    queryKey: computed(() => queryKeys.portfolio(kind, toValue(id))),
    queryFn: ({ queryKey }) => portfolioApis[kind].get(queryKey[2] as string) as Promise<PortfolioDetailByKind[K]>,
    enabled: computed(() => !!toValue(id)),
  })
}

/** Details of several portfolios of one kind in parallel (shares cache entries with `usePortfolio`). */
export function usePortfolioDetails<K extends PortfolioKind>(kind: K, portfolios: MaybeRefOrGetter<Array<{ id: string }>>) {
  return useQueries({
    queries: computed(() =>
      toValue(portfolios).map((p) => ({
        queryKey: queryKeys.portfolio(kind, p.id),
        queryFn: () => portfolioApis[kind].get(p.id) as Promise<PortfolioDetailByKind[K]>,
      })),
    ),
  })
}

export const useDebts = (kind: DebtKind) => useQuery<Debt[]>({ queryKey: queryKeys.debts(kind), queryFn: debtApis[kind].list })

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
