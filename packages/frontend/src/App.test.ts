import { describe, expect, test, vi } from "vitest"
import { createMemoryHistory } from "vue-router"
import { mockApi } from "../test/fakeApi"
import { account, category, me, page, transaction } from "../test/fixtures"
import { createFakeAuth } from "./auth"
import { renderApp, screen } from "../test/render"
import App from "./App.vue"
import { createAppRouter } from "./router"

const mockEverything = () =>
  mockApi({
    "GET /me": me(), "GET /accounts": [account()], "GET /categories": [category()], "GET /subscriptions": [],
    "GET /transactions": page([transaction()]), "GET /mortgages": [], "GET /loans": [],
    "GET /crypto": [], "GET /metals": [], "GET /stocks": [], "GET /properties": [], "GET /equity": [], "GET /pensions": [],
    "GET /net-worth/history": { currency: "EUR", points: [] }, "GET /transactions/summary": { from: "", to: "", currency: "EUR", income: 0, expenses: 0, byCategory: [] },
  })

/** Mounts the real app: real router (lazy pages), real shell. */
const mountApp = (route: string, auth = createFakeAuth()) =>
  renderApp(App, { route, auth, router: createAppRouter(createMemoryHistory(), auth) })

describe("routing", () => {
  test("the root redirects to the dashboard", async () => {
    mockEverything()
    await mountApp("/")
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
  })

  test("the old /transactions URL lands on the overview", async () => {
    mockEverything()
    await mountApp("/transactions")
    expect(await screen.findByRole("heading", { name: "Transactions" })).toBeInTheDocument()
    expect(await screen.findByText("Roastery")).toBeInTheDocument()
  })

  test.each([
    ["/mortgages", "Mortgages"],
    ["/loans", "Loans"],
    ["/crypto", "Crypto"],
    ["/stocks", "Stocks"],
    ["/metals", "Precious Metals"],
    ["/subscriptions", "Subscriptions"],
    ["/profile", "Profile"],
    ["/accounts", "Accounts"],
    ["/settings", "Settings"],
  ])("%s loads its (lazily imported) page", async (route, heading) => {
    mockEverything()
    await mountApp(route)
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument()
  })

  test("the navigation is rendered around every page", async () => {
    mockEverything()
    await mountApp("/loans")
    expect(await screen.findByRole("heading", { name: "Loans" })).toBeInTheDocument()
    expect(screen.getAllByText(/Mortgages/).length).toBeGreaterThan(0)
  })

  test("pages talk only to endpoints that exist", async () => {
    const api = mockEverything()
    await mountApp("/dashboard")
    await screen.findByRole("heading", { name: "Dashboard" })
    expect(api.unmatched).toEqual([])
  })
})

describe("authentication gate", () => {
  test("without a session navigating to a page starts the sign-in instead", async () => {
    const signinRedirect = vi.fn(async () => {})
    const auth = createFakeAuth({ user: null, signinRedirect })
    const router = createAppRouter(createMemoryHistory(), auth)
    await router.push("/dashboard")
    expect(signinRedirect).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).not.toBe("/dashboard") // the navigation was cancelled
  })

  test("with a session the same navigation goes through", async () => {
    const signinRedirect = vi.fn(async () => {})
    const router = createAppRouter(createMemoryHistory(), createFakeAuth({ signinRedirect }))
    await router.push("/dashboard")
    expect(router.currentRoute.value.path).toBe("/dashboard")
    expect(signinRedirect).not.toHaveBeenCalled()
  })

  test("the sign-in callback page is reachable without a session", async () => {
    mockEverything()
    const auth = createFakeAuth({ user: null })
    await mountApp("/auth/callback", auth)
    expect(await screen.findByText(/Completing sign in|Authentication failed/)).toBeInTheDocument()
  })
})
