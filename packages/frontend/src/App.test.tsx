import { describe, expect, test } from "bun:test"
import { mockApi } from "../test/fakeApi"
import { account, category, me, page, transaction } from "../test/fixtures"
import { renderApp, screen } from "../test/render"
import { AppRoutes } from "./App"

const mockEverything = () =>
  mockApi({
    "GET /me": me(), "GET /accounts": [account()], "GET /categories": [category()], "GET /subscriptions": [],
    "GET /transactions": page([transaction()]), "GET /mortgages": [], "GET /loans": [],
    "GET /crypto": [], "GET /metals": [], "GET /stocks": [],
  })

describe("routing", () => {
  test("the root redirects to the dashboard", async () => {
    mockEverything()
    renderApp(<AppRoutes />, { route: "/" })
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
  })

  test("the old /transactions URL lands on the overview", async () => {
    mockEverything()
    renderApp(<AppRoutes />, { route: "/transactions" })
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
    ["/checking", "Checking"],
    ["/savings", "Savings"],
    ["/settings", "Settings"],
  ])("%s loads its (lazily imported) page", async (route, heading) => {
    mockEverything()
    renderApp(<AppRoutes />, { route })
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument()
  })

  test("the navigation is rendered around every page", async () => {
    mockEverything()
    renderApp(<AppRoutes />, { route: "/loans" })
    expect(await screen.findByRole("heading", { name: "Loans" })).toBeInTheDocument()
    expect(screen.getAllByText(/Mortgages/).length).toBeGreaterThan(0)
  })

  test("pages talk only to endpoints that exist", async () => {
    const api = mockEverything()
    renderApp(<AppRoutes />, { route: "/dashboard" })
    await screen.findByRole("heading", { name: "Dashboard" })
    expect(api.unmatched).toEqual([])
  })
})
