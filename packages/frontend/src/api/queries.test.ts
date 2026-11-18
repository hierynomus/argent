import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { QueryClient } from "@tanstack/vue-query"
import { mockApi } from "../../test/fakeApi"
import { account, cryptoDetail, debt, page, portfolio } from "../../test/fixtures"
import { runComposable, waitFor } from "../../test/render"
import { queryKeys } from "./keys"
import { useAccounts, useDebts, useInvalidate, usePortfolio, usePortfolioDetails, usePortfolios, useRecentTransactions, useSubscriptionTransactions, useTransactions } from "./queries"

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

describe("read composables", () => {
  test("useAccounts fetches /accounts", async () => {
    mockApi({ "GET /accounts": [account()] })
    const { result } = await runComposable(() => useAccounts(), { client: newClient() })
    await waitFor(() => expect(result.data.value).toHaveLength(1))
  })

  test("usePortfolios / usePortfolio use the right endpoints for the kind", async () => {
    const api = mockApi({ "GET /stocks": [portfolio({ id: "s1", type: "stocks" })], "GET /stocks/:id": { id: "s1", positions: [] } })
    const client = newClient()
    const list = await runComposable(() => usePortfolios("stocks"), { client })
    const detail = await runComposable(() => usePortfolio("stocks", "s1"), { client })
    await waitFor(() => expect(list.result.data.value).toHaveLength(1))
    await waitFor(() => expect(detail.result.data.value).toBeDefined())
    expect(api.calls().map((c) => c.path).sort()).toEqual(["/stocks", "/stocks/s1"])
  })

  test("usePortfolio does nothing without an id, and starts when the id appears", async () => {
    const api = mockApi({ "GET /crypto/:id": cryptoDetail({ id: "p1" }) })
    const id = ref<string | null>(null)
    const { result } = await runComposable(() => usePortfolio("crypto", id), { client: newClient() })
    await new Promise((r) => setTimeout(r, 30))
    expect(api.calls()).toHaveLength(0)
    id.value = "p1"
    await waitFor(() => expect(result.data.value).toBeDefined())
    expect(api.calls("GET", "/crypto/p1")).toHaveLength(1)
  })

  test("a changed id refetches under a different key", async () => {
    const api = mockApi({ "GET /crypto/:id": ({ params }: { params: { id: string } }) => cryptoDetail({ id: params.id }) })
    const id = ref<string | null>("p1")
    const { result } = await runComposable(() => usePortfolio("crypto", id), { client: newClient() })
    await waitFor(() => expect(result.data.value?.id).toBe("p1"))
    id.value = "p2"
    await waitFor(() => expect(result.data.value?.id).toBe("p2"))
    expect(api.calls().map((c) => c.path)).toEqual(["/crypto/p1", "/crypto/p2"])
  })

  test("usePortfolio and usePortfolioDetails share one cache entry (one request for both)", async () => {
    const api = mockApi({ "GET /crypto/:id": cryptoDetail({ id: "p1" }) })
    // (fresh data isn't refetched on mount — so a second request would mean the keys differ)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } })
    const single = await runComposable(() => usePortfolio("crypto", "p1"), { client })
    await waitFor(() => expect(single.result.data.value).toBeDefined())
    const many = await runComposable(() => usePortfolioDetails("crypto", [{ id: "p1" }]), { client })
    await waitFor(() => expect(many.result.value[0].data).toBeDefined())
    expect(api.calls("GET", "/crypto/p1")).toHaveLength(1)
  })

  test("usePortfolioDetails follows a changing list of portfolios", async () => {
    const api = mockApi({ "GET /crypto/:id": ({ params }: { params: { id: string } }) => cryptoDetail({ id: params.id }) })
    const list = ref([{ id: "p1" }])
    const { result } = await runComposable(() => usePortfolioDetails("crypto", list), { client: newClient() })
    await waitFor(() => expect(result.value).toHaveLength(1))
    list.value = [{ id: "p1" }, { id: "p2" }]
    await waitFor(() => expect(result.value).toHaveLength(2))
    await waitFor(() => expect(api.calls("GET", "/crypto/p2")).toHaveLength(1))
  })

  test("useDebts hits the endpoint of its kind", async () => {
    const api = mockApi({ "GET /mortgages": [debt()], "GET /loans": [] })
    const { result } = await runComposable(() => useDebts("mortgages"), { client: newClient() })
    await waitFor(() => expect(result.data.value).toHaveLength(1))
    expect(api.calls().map((c) => c.path)).toEqual(["/mortgages"])
  })

  test("useTransactions turns filters into query parameters, and refetches when they change", async () => {
    const api = mockApi({ "GET /transactions": page([]) })
    const filters = ref({ search: "x", page: 2, accountIds: ["a", "b"] })
    const { result } = await runComposable(() => useTransactions(filters), { client: newClient() })
    await waitFor(() => expect(result.data.value).toBeDefined())
    expect(api.calls()[0].query).toMatchObject({ search: "x", page: "2", accountIds: "a,b" })
    filters.value = { ...filters.value, search: "y" }
    await waitFor(() => expect(api.calls()).toHaveLength(2))
    expect(api.calls()[1].query.search).toBe("y")
  })

  test("useRecentTransactions restricts to one account when given", async () => {
    const api = mockApi({ "GET /transactions": page([]) })
    const { result } = await runComposable(() => useRecentTransactions(10, "a1"), { client: newClient() })
    await waitFor(() => expect(result.data.value).toBeDefined())
    expect(api.calls()[0].query).toMatchObject({ pageSize: "10", accountIds: "a1" })
  })

  test("useSubscriptionTransactions only fetches when enabled", async () => {
    const api = mockApi({ "GET /subscriptions/:id/transactions": [] })
    const enabled = ref(false)
    await runComposable(() => useSubscriptionTransactions("s1", enabled), { client: newClient() })
    await new Promise((r) => setTimeout(r, 30))
    expect(api.calls()).toHaveLength(0)
    enabled.value = true
    await waitFor(() => expect(api.calls()).toHaveLength(1))
  })
})

describe("useInvalidate", () => {
  /** Which query keys would be refreshed by `act`? */
  async function refreshed(act: (i: ReturnType<typeof useInvalidate>) => void, seeded: ReadonlyArray<readonly unknown[]>) {
    const client = newClient()
    for (const k of seeded) client.setQueryData(k, [])
    const { result } = await runComposable(() => useInvalidate(), { client })
    act(result)
    return seeded.filter((k) => client.getQueryState(k)?.isInvalidated)
  }

  const all = [
    queryKeys.me, queryKeys.accounts, queryKeys.categories, queryKeys.subscriptions, queryKeys.subscriptionTransactions("s1"),
    queryKeys.transactionList({ page: 1 }), queryKeys.transactionsRecent(), queryKeys.transactionsRecent("a1"), queryKeys.transactionsMonth("2024-06"),
    queryKeys.portfolios("crypto"), queryKeys.portfolio("crypto", "p1"), queryKeys.portfolios("stocks"), queryKeys.portfolio("stocks", "s1"),
    queryKeys.debts("mortgages"), queryKeys.debts("loans"), queryKeys.adminAccounts, queryKeys.adminSharing,
  ] as const

  test("transactions: refreshes every transaction view — the list, the dashboard's recent and monthly summaries", async () => {
    expect(await refreshed((i) => i.transactions(), all)).toEqual([queryKeys.transactionList({ page: 1 }), queryKeys.transactionsRecent(), queryKeys.transactionsRecent("a1"), queryKeys.transactionsMonth("2024-06")])
  })

  test("portfolios(kind): the list and every detail of that kind, nothing of other kinds", async () => {
    expect(await refreshed((i) => i.portfolios("crypto"), all)).toEqual([queryKeys.portfolios("crypto"), queryKeys.portfolio("crypto", "p1")])
  })

  test("debts(kind): only that kind", async () => {
    expect(await refreshed((i) => i.debts("loans"), all)).toEqual([queryKeys.debts("loans")])
  })

  test("subscriptions: the list and the payments of each subscription", async () => {
    expect(await refreshed((i) => i.subscriptions(), all)).toEqual([queryKeys.subscriptions, queryKeys.subscriptionTransactions("s1")])
  })

  test("accounts / categories / me touch only their own key", async () => {
    expect(await refreshed((i) => i.accounts(), all)).toEqual([queryKeys.accounts])
    expect(await refreshed((i) => i.categories(), all)).toEqual([queryKeys.categories])
    expect(await refreshed((i) => i.me(), all)).toEqual([queryKeys.me])
  })

  test("admin: both admin views", async () => {
    expect(await refreshed((i) => i.admin(), all)).toEqual([queryKeys.adminAccounts, queryKeys.adminSharing])
  })

  test("afterImport: accounts, transactions (all views) and subscriptions", async () => {
    const r = await refreshed((i) => void i.afterImport(), all)
    expect(r).toContainEqual(queryKeys.accounts)
    expect(r).toContainEqual(queryKeys.subscriptions)
    expect(r).toContainEqual(queryKeys.transactionsRecent())
    expect(r).not.toContainEqual(queryKeys.categories)
    expect(r).not.toContainEqual(queryKeys.portfolios("crypto"))
  })

  test("everything: all of it", async () => {
    expect(await refreshed((i) => void i.everything(), all)).toHaveLength(all.length)
  })

  test("it triggers refetches of the mounted queries it covers", async () => {
    const api = mockApi({ "GET /accounts": [account()] })
    const client = newClient()
    const q = await runComposable(() => useAccounts(), { client })
    await waitFor(() => expect(q.result.data.value).toBeDefined())
    const inv = await runComposable(() => useInvalidate(), { client })
    inv.result.accounts()
    await waitFor(() => expect(api.calls("GET", "/accounts")).toHaveLength(2))
  })
})
