import { computed, toValue, type MaybeRefOrGetter } from "vue"
import type { LockStatus, PreviewDebtPartBody } from "@argent/shared"
import { useQueries, useQuery, useQueryClient } from "@tanstack/vue-query"
import { getAccounts, getBalanceHistory } from "./accounts"
import { getAdminAccounts, getAdminSharing } from "./admin"
import { getCategories } from "./categories"
import { debtApis, type Debt } from "./debts"
import { equityApi } from "./equity"
import { pensionsApi } from "./pensions"
import { queryKeys, type DebtKind, type PortfolioKind } from "./keys"
import { getLocalSettings, getLockStatus } from "./local"
import { getMe } from "./me"
import { getNetWorthHistory } from "./netWorth"
import { portfolioApis, type HistoryParams, type PortfolioDetailByKind } from "./portfolios"
import { propertiesApi } from "./properties"
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
/** The standalone app's settings (backup folder, paths); the caller only enables it in the desktop app. */
/** Whether the standalone app is locked (only asked in local mode). */
export const useLockStatus = (o: Enabled = {}) => useQuery({ queryKey: queryKeys.lockStatus, queryFn: getLockStatus, enabled: enabledOf(o), retry: false, staleTime: Infinity })
export const useLocalSettings = (o: Enabled = {}) => useQuery({ queryKey: queryKeys.localSettings, queryFn: getLocalSettings, enabled: enabledOf(o) })
export const useAccounts = () => useQuery({ queryKey: queryKeys.accounts, queryFn: getAccounts })
/** An account's balance over time. Lives under the transactions key, so everything that changes them refreshes it. */
export const useBalanceHistory = (id: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.balanceHistory(toValue(id))),
    queryFn: ({ queryKey }) => getBalanceHistory(queryKey[2] as string),
  })
export const useNetWorthHistory = () => useQuery({ queryKey: queryKeys.netWorth, queryFn: getNetWorthHistory })
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

/** Price history of one asset in a currency over a range (the asset chart). Prices barely change within minutes. */
export function useAssetHistory(kind: "crypto" | "stocks", symbol: MaybeRefOrGetter<string>, currency: MaybeRefOrGetter<HistoryParams["currency"]>, range: MaybeRefOrGetter<HistoryParams["range"]>) {
  return useQuery({
    queryKey: computed(() => queryKeys.assetHistory(kind, toValue(symbol), toValue(currency), toValue(range))),
    // parameters come from the key (see the note at the top of this file)
    queryFn: ({ queryKey }) => portfolioApis[kind].history(queryKey[2] as string, { currency: queryKey[3] as HistoryParams["currency"], range: queryKey[4] as HistoryParams["range"] }),
    staleTime: 10 * 60 * 1000,
  })
}

export const useEquityPlans = () => useQuery({ queryKey: queryKeys.equity, queryFn: equityApi.list })
export const usePensionPlans = () => useQuery({ queryKey: queryKeys.pensions, queryFn: pensionsApi.list })
export const useProperties = () => useQuery({ queryKey: queryKeys.properties, queryFn: propertiesApi.list })

export const useDebts = (kind: DebtKind) => useQuery<Debt[]>({ queryKey: queryKeys.debts(kind), queryFn: debtApis[kind].list })

/**
 * What a part comes to (balance, installment, term), computed by the server for a part that is still being
 * entered. `body` is null until the form is complete and valid: then nothing is requested.
 */
export const useDebtPartPreview = (kind: DebtKind, body: MaybeRefOrGetter<PreviewDebtPartBody | null>) =>
  useQuery({
    queryKey: computed(() => queryKeys.debtPartPreview(kind, toValue(body) ?? {})),
    // parameters come from the key (see the note at the top of this file)
    queryFn: ({ queryKey }) => debtApis[kind].previewPart(queryKey[2] as PreviewDebtPartBody),
    enabled: () => toValue(body) !== null,
    placeholderData: (previous) => previous, // keep showing the last numbers while the next ones load
    retry: false,
    staleTime: 60 * 1000,
  })

/** The balance of a mortgage/loan month by month, with the projection and the course without extra payments. */
export const useDebtSchedule = (kind: DebtKind, debtId: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.debtSchedule(kind, toValue(debtId))),
    // parameters come from the key (see the note at the top of this file)
    queryFn: ({ queryKey }) => debtApis[kind].schedule(queryKey[3] as string),
  })

/** What is left of a part on a day: the balance a continuation starts from. Not requested while `date` is empty. */
export const usePartCarryOver = (kind: DebtKind, debtId: MaybeRefOrGetter<string>, partId: MaybeRefOrGetter<string>, date: MaybeRefOrGetter<string>) =>
  useQuery({
    queryKey: computed(() => queryKeys.debtCarryOver(kind, toValue(debtId), toValue(partId), toValue(date))),
    // parameters come from the key (see the note at the top of this file)
    queryFn: ({ queryKey }) => debtApis[kind].carryOver(queryKey[3] as string, queryKey[4] as string, queryKey[5] as string),
    enabled: () => /^\d{4}-\d{2}-\d{2}$/.test(toValue(date)),
    retry: false,
  })

/** Cache refreshers, named for what changed. Prefix keys mean one call refreshes every dependent view. */
export function useInvalidate() {
  const qc = useQueryClient()
  // the net worth history is built from all of these, so each of them refreshes it too
  const netWorth = () => qc.invalidateQueries({ queryKey: queryKeys.netWorth })
  const and = <T,>(p: Promise<T>) => Promise.all([p, netWorth()]).then(([r]) => r)
  return {
    accounts: () => and(qc.invalidateQueries({ queryKey: queryKeys.accounts })),
    categories: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
    subscriptions: () => qc.invalidateQueries({ queryKey: queryKeys.subscriptions }),
    transactions: () => and(qc.invalidateQueries({ queryKey: queryKeys.transactions })),
    me: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
    /** the portfolio list and every portfolio's detail of this kind */
    portfolios: (kind: PortfolioKind) => and(qc.invalidateQueries({ queryKey: queryKeys.portfolios(kind) })),
    // a property's debt and equity come from its linked mortgages/loans, so those refresh with them
    debts: (kind: DebtKind) => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.debts(kind) }), qc.invalidateQueries({ queryKey: queryKeys.properties }), netWorth()]),
    properties: () => and(qc.invalidateQueries({ queryKey: queryKeys.properties })),
    equity: () => qc.invalidateQueries({ queryKey: queryKeys.equity }),
    pensions: () => and(qc.invalidateQueries({ queryKey: queryKeys.pensions })),
    admin: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    /** the lock state changed (unlocked, locked, password set or removed): remember it */
    lockStatus: (status: LockStatus) => qc.setQueryData(queryKeys.lockStatus, status),
    /** forget everything that was loaded, so a locked app keeps no data in memory */
    forgetAll: () => qc.clear(),
    localSettings: () => qc.invalidateQueries({ queryKey: queryKeys.localSettings }),
    /** everything — after the whole database was replaced (restore) */
    everything: () => qc.invalidateQueries(),
    /** after accounts or transactions were entered, edited or deleted by hand */
    afterManualEntry: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.accounts }),
        qc.invalidateQueries({ queryKey: queryKeys.transactions }),
        qc.invalidateQueries({ queryKey: queryKeys.subscriptions }),
        netWorth(),
      ]),
    /** after an import: everything derived from transactions and accounts */
    afterImport: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.accounts }),
        qc.invalidateQueries({ queryKey: queryKeys.transactions }),
        qc.invalidateQueries({ queryKey: queryKeys.subscriptions }),
        netWorth(),
      ]),
  }
}
