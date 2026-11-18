import axe from "axe-core"
import { describe, expect, test } from "vitest"
import { createMemoryHistory } from "vue-router"
import { mockApi } from "../test/fakeApi"
import { account, category, cryptoDetail, debt, equityPlan, lot, me, metalDetail, page, portfolio, property, stockDetail, stockPosition, subscription, transaction } from "../test/fixtures"
import { createFakeAuth } from "./auth"
import { renderApp, screen, waitFor } from "../test/render"
import App from "./App.vue"
import { createAppRouter } from "./router"

/**
 * Accessibility audit: every screen (and the main interactive states) is rendered with realistic data
 * and checked with axe-core. Colour contrast is skipped: happy-dom has no layout or computed styles.
 */
async function violations() {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)
}

const mockAll = () =>
  mockApi({
    "GET /me": me({ isAdmin: true, canImport: true }),
    "GET /accounts": [account({ id: "a1", name: "Everyday" }), account({ id: "a2", name: "Rainy day", type: "savings", iban: "NL02SAVE0000000002" })],
    "GET /categories": [category()],
    "GET /subscriptions": [subscription(), subscription({ id: "s2", status: "confirmed", name: "Gym" })],
    "GET /subscriptions/:id/transactions": [],
    "GET /transactions": page([transaction(), transaction({ id: "t2", description: "Salary", creditDebitIndicator: "CRDT", counterpartyName: "Employer" })]),
    "GET /mortgages": [debt()], "GET /loans": [debt({ id: "l1", name: "Car" })],
    "GET /crypto": [portfolio({ id: "c1" })], "GET /crypto/:id": cryptoDetail({ id: "c1" }),
    "GET /metals": [portfolio({ id: "m1", type: "metals" })], "GET /metals/:id": metalDetail({ id: "m1", lots: [lot()] }),
    "GET /stocks": [portfolio({ id: "s1", type: "stocks", broker: "DEGIRO" })], "GET /stocks/:id": stockDetail({ id: "s1", positions: [stockPosition()] }),
    "GET /admin/accounts": [{ ...account(), members: [{ groupName: "family", role: "editor" }], ownerProfile: null }],
    "GET /admin/sharing": { portfolios: [], mortgages: [], loans: [], properties: [] },
    "GET /properties": [property()], "GET /equity": [equityPlan()],
  })

async function open(route: string, ready: string | RegExp) {
  mockAll()
  const auth = createFakeAuth()
  const utils = await renderApp(App, { route, auth, router: createAppRouter(createMemoryHistory(), auth) })
  await screen.findAllByText(ready)
  return utils
}

describe("accessibility (axe)", () => {
  test.each([
    ["/dashboard", "Dashboard"],
    ["/overview", "Roastery"],
    ["/checking", "Everyday"],
    ["/savings", "Rainy day"],
    ["/subscriptions", "Gym"],
    ["/settings", "Everyday"],
    ["/mortgages", "House"],
    ["/loans", "Car"],
    ["/crypto", "Open cost"],
    ["/metals", "Open cost"],
    ["/stocks", "AAPL"],
    ["/property", "Our house"],
    ["/equity", "Acme BV"],
    ["/profile", "Dev User"],
    ["/admin", "family"],
  ] as const)("%s has no violations", async (route, ready) => {
    await open(route, ready)
    expect(await violations()).toEqual([])
  })

  test("the settings tabs (labels, import) have no violations", async () => {
    const { user } = await open("/settings", "Everyday")
    await user.click(screen.getByRole("button", { name: "Labels" }))
    await screen.findByText("Add label")
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Import" }))
    await screen.findByText(/Drag & drop/)
    expect(await violations()).toEqual([])
  })

  test("the transaction detail panel and the bulk action bar have no violations", async () => {
    const { user } = await open("/overview", "Roastery")
    await user.click(screen.getAllByLabelText(/Select transaction/)[0])
    expect(await violations()).toEqual([])
    await user.click(screen.getByText("Salary"))
    await screen.findByRole("dialog")
    expect(await violations()).toEqual([])
  })

  test("the open trade forms have no violations", async () => {
    const { user } = await open("/crypto", "Open cost")
    await user.click(await screen.findByRole("button", { name: /Record trade/ }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Save trade" })).toBeInTheDocument())
    expect(await violations()).toEqual([])
  })

  test("the new-portfolio form and the sharing panel have no violations", async () => {
    const { user } = await open("/stocks", "AAPL")
    await user.click(screen.getByRole("button", { name: "+ New portfolio" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Share" }))
    expect(await violations()).toEqual([])
  })

  test("the overview tab and an open asset chart have no violations", async () => {
    mockApi({
      "GET /me": me(),
      "GET /crypto": [portfolio({ id: "c1", name: "Main" }), portfolio({ id: "c2", name: "Second" })],
      "GET /crypto/:id": ({ params }: any) => cryptoDetail({
        id: params.id, name: params.id === "c1" ? "Main" : "Second",
        positions: [{ symbol: "BTC", name: "Bitcoin", assetForm: null, balance: 1, avgCostBasis: 100, totalCost: 100, realizedPnL: 0, currentPrice: 150, currentValue: 150, unrealizedPnL: 50 }],
        trades: [{ id: `t-${params.id}`, portfolioId: params.id, tradeDate: "2024-01-02", fromSymbol: "EUR", fromAmount: "100", toSymbol: "BTC", toAmount: "1", baseCurrencyAmount: "100", notes: null, createdAt: "" }],
      }),
      "GET /crypto/history/:symbol": { symbol: "BTC", currency: "EUR", range: "1y", points: [100, 120, 110, 130].map((v, i) => ({ t: Date.UTC(2024, 0, 1) + i * 86_400_000, v })) },
      "GET /accounts": [], "GET /categories": [],
    })
    const auth = createFakeAuth()
    const { user } = await renderApp(App, { route: "/crypto", auth, router: createAppRouter(createMemoryHistory(), auth) })
    await screen.findByText(/2 portfolios: Main, Second/)
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "BTC" }))
    await screen.findByRole("img", { name: /Bitcoin price/ })
    expect(await violations()).toEqual([])
    await user.click(screen.getByText("Show data as a table"))
    expect(await violations()).toEqual([])
  })

  test("the property forms (new, edit, valuation, links) have no violations", async () => {
    const { user } = await open("/property", "Our house")
    await user.click(screen.getByRole("button", { name: "+ New property" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Link mortgage / loan" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "+ Add valuation" }))
    expect(await violations()).toEqual([])
  })

  test("the options forms (company, grant, edit grant, price, rename) have no violations", async () => {
    const { user } = await open("/equity", "Acme BV")
    await user.click(screen.getByRole("button", { name: "+ New company" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "Rename" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "+ Add grant" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "Edit 2023 grant" }))
    expect(await violations()).toEqual([])
    await user.click(screen.getByRole("button", { name: "+ Add price" }))
    expect(await violations()).toEqual([])
  })
})
