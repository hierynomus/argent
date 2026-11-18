import { describe, expect, test } from "bun:test"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { mockApi } from "../../test/fakeApi"
import { account, cryptoDetail, debt, page, portfolio } from "../../test/fixtures"
import { queryKeys } from "./keys"
import { useAccounts, useDebts, useInvalidate, usePortfolio, usePortfolioDetails, usePortfolios, useRecentTransactions, useSubscriptionTransactions, useTransactions } from "./queries"

const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })

describe("queryKeys", () => {
  test("transaction views all live under ['transactions'] so one invalidation refreshes them all", () => {
    const prefix = queryKeys.transactions[0]
    expect(queryKeys.transactionList({ page: 1 })[0]).toBe(prefix)
    expect(queryKeys.transactionsRecent()[0]).toBe(prefix)
    expect(queryKeys.transactionsRecent("a1")[0]).toBe(prefix)
    expect(queryKeys.transactionsMonth("2024-06")[0]).toBe(prefix)
  })

  test("a portfolio's detail lives under its list key", () => {
    expect(queryKeys.portfolio("crypto", "p1").slice(0, 2)).toEqual([...queryKeys.portfolios("crypto")])
    expect(queryKeys.portfolio("crypto", "p1")[0]).toBe(queryKeys.portfolios("stocks")[0])
    expect(queryKeys.portfolio("crypto", "p1")[1]).not.toBe(queryKeys.portfolio("stocks", "p1")[1]) // kinds never collide
  })

  test("a subscription's transactions live under the subscriptions key", () => {
    expect(queryKeys.subscriptionTransactions("s1")[0]).toBe(queryKeys.subscriptions[0])
  })

  test("debts are keyed by kind", () => {
    expect(queryKeys.debts("mortgages")).not.toEqual(queryKeys.debts("loans"))
  })
})

describe("read hooks", () => {
  test("useAccounts fetches /accounts", async () => {
    mockApi({ "GET /accounts": [account()] })
    const { result } = renderHook(() => useAccounts(), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
  })

  test("usePortfolios / usePortfolio use the right endpoints for the kind", async () => {
    const api = mockApi({ "GET /stocks": [portfolio({ id: "s1", type: "stocks" })], "GET /stocks/:id": { id: "s1", positions: [] } })
    const client = newClient()
    const list = renderHook(() => usePortfolios("stocks"), { wrapper: wrapper(client) })
    const detail = renderHook(() => usePortfolio("stocks", "s1"), { wrapper: wrapper(client) })
    await waitFor(() => expect(list.result.current.data).toHaveLength(1))
    await waitFor(() => expect(detail.result.current.data).toBeDefined())
    expect(api.calls().map((c) => c.path).sort()).toEqual(["/stocks", "/stocks/s1"])
  })

  test("usePortfolio does nothing without an id", async () => {
    const api = mockApi({})
    renderHook(() => usePortfolio("crypto", null), { wrapper: wrapper(newClient()) })
    await new Promise((r) => setTimeout(r, 30))
    expect(api.calls()).toHaveLength(0)
  })

  test("usePortfolio and usePortfolioDetails share one cache entry (one request for both)", async () => {
    const api = mockApi({ "GET /crypto/:id": cryptoDetail({ id: "p1" }) })
    // (fresh data isn't refetched on mount — so a second request would mean the keys differ)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
    const single = renderHook(() => usePortfolio("crypto", "p1"), { wrapper: wrapper(client) })
    await waitFor(() => expect(single.result.current.data).toBeDefined())
    const many = renderHook(() => usePortfolioDetails("crypto", [{ id: "p1" }]), { wrapper: wrapper(client) })
    await waitFor(() => expect(many.result.current[0].data).toBeDefined())
    expect(api.calls("GET", "/crypto/p1")).toHaveLength(1)
  })

  test("useDebts hits the endpoint of its kind", async () => {
    const api = mockApi({ "GET /mortgages": [debt()], "GET /loans": [] })
    const m = renderHook(() => useDebts("mortgages"), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(m.result.current.data).toHaveLength(1))
    expect(api.calls().map((c) => c.path)).toEqual(["/mortgages"])
  })

  test("useTransactions turns filters into query parameters", async () => {
    const api = mockApi({ "GET /transactions": page([]) })
    const { result } = renderHook(() => useTransactions({ search: "x", page: 2, accountIds: ["a", "b"] }), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(api.calls()[0].query).toMatchObject({ search: "x", page: "2", accountIds: "a,b" })
  })

  test("useRecentTransactions restricts to one account when given", async () => {
    const api = mockApi({ "GET /transactions": page([]) })
    const { result } = renderHook(() => useRecentTransactions(10, "a1"), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(api.calls()[0].query).toMatchObject({ pageSize: "10", accountIds: "a1" })
  })

  test("useSubscriptionTransactions only fetches when enabled", async () => {
    const api = mockApi({ "GET /subscriptions/:id/transactions": [] })
    const off = renderHook(() => useSubscriptionTransactions("s1", false), { wrapper: wrapper(newClient()) })
    await new Promise((r) => setTimeout(r, 30))
    expect(api.calls()).toHaveLength(0)
    off.unmount()
    renderHook(() => useSubscriptionTransactions("s1", true), { wrapper: wrapper(newClient()) })
    await waitFor(() => expect(api.calls()).toHaveLength(1))
  })
})

describe("useInvalidate", () => {
  /** Which query keys would be refreshed by `act`? */
  function refreshed(act: (i: ReturnType<typeof useInvalidate>) => void, seeded: ReadonlyArray<readonly unknown[]>) {
    const client = newClient()
    for (const k of seeded) client.setQueryData(k, [])
    const { result } = renderHook(() => useInvalidate(), { wrapper: wrapper(client) })
    act(result.current)
    return seeded.filter((k) => client.getQueryState(k)?.isInvalidated)
  }

  const all = [
    queryKeys.me, queryKeys.accounts, queryKeys.categories, queryKeys.subscriptions, queryKeys.subscriptionTransactions("s1"),
    queryKeys.transactionList({ page: 1 }), queryKeys.transactionsRecent(), queryKeys.transactionsRecent("a1"), queryKeys.transactionsMonth("2024-06"),
    queryKeys.portfolios("crypto"), queryKeys.portfolio("crypto", "p1"), queryKeys.portfolios("stocks"), queryKeys.portfolio("stocks", "s1"),
    queryKeys.debts("mortgages"), queryKeys.debts("loans"), queryKeys.adminAccounts, queryKeys.adminSharing,
  ] as const

  test("transactions: refreshes every transaction view — the list, the dashboard's recent and monthly summaries", () => {
    const r = refreshed((i) => i.transactions(), all)
    expect(r).toEqual([queryKeys.transactionList({ page: 1 }), queryKeys.transactionsRecent(), queryKeys.transactionsRecent("a1"), queryKeys.transactionsMonth("2024-06")])
  })

  test("portfolios(kind): the list and every detail of that kind, nothing of other kinds", () => {
    const r = refreshed((i) => i.portfolios("crypto"), all)
    expect(r).toEqual([queryKeys.portfolios("crypto"), queryKeys.portfolio("crypto", "p1")])
  })

  test("debts(kind): only that kind", () => {
    expect(refreshed((i) => i.debts("loans"), all)).toEqual([queryKeys.debts("loans")])
  })

  test("subscriptions: the list and the payments of each subscription", () => {
    expect(refreshed((i) => i.subscriptions(), all)).toEqual([queryKeys.subscriptions, queryKeys.subscriptionTransactions("s1")])
  })

  test("accounts / categories / me touch only their own key", () => {
    expect(refreshed((i) => i.accounts(), all)).toEqual([queryKeys.accounts])
    expect(refreshed((i) => i.categories(), all)).toEqual([queryKeys.categories])
    expect(refreshed((i) => i.me(), all)).toEqual([queryKeys.me])
  })

  test("admin: both admin views", () => {
    expect(refreshed((i) => i.admin(), all)).toEqual([queryKeys.adminAccounts, queryKeys.adminSharing])
  })

  test("afterImport: accounts, transactions (all views) and subscriptions", async () => {
    const r = refreshed((i) => void i.afterImport(), all)
    expect(r).toContainEqual(queryKeys.accounts)
    expect(r).toContainEqual(queryKeys.subscriptions)
    expect(r).toContainEqual(queryKeys.transactionsRecent())
    expect(r).not.toContainEqual(queryKeys.categories)
    expect(r).not.toContainEqual(queryKeys.portfolios("crypto"))
  })

  test("everything: all of it", () => {
    expect(refreshed((i) => void i.everything(), all)).toHaveLength(all.length)
  })

  test("it triggers refetches of the mounted queries it covers", async () => {
    const api = mockApi({ "GET /accounts": [account()] })
    const client = newClient()
    const q = renderHook(() => useAccounts(), { wrapper: wrapper(client) })
    await waitFor(() => expect(q.result.current.data).toBeDefined())
    const inv = renderHook(() => useInvalidate(), { wrapper: wrapper(client) })
    inv.result.current.accounts()
    await waitFor(() => expect(api.calls("GET", "/accounts")).toHaveLength(2))
  })
})
