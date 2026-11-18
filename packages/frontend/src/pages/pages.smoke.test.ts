import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { account, category, debt, me, page, portfolio, property, cryptoDetail, subscription, transaction } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import Layout from "../components/Layout.vue"
import DashboardPage from "./Dashboard.vue"
import OverviewPage from "./Overview.vue"
import SettingsPage from "./Settings.vue"
import AdminPage from "./Admin.vue"
import SubscriptionsPage from "./Subscriptions.vue"
import ProfilePage from "./Profile.vue"
import CheckingPage from "./Checking.vue"
import SavingsPage from "./Savings.vue"

/** Every screen renders real data from the (fake) API and talks only to endpoints that exist. */

describe("Dashboard", () => {
  test("computes net worth from accounts, investments and debts", async () => {
    const api = mockApi({
      "GET /accounts": [account({ balance: "1000.00" })],
      "GET /mortgages": [debt({ totalCurrentBalance: 400, totalMonthlyPayment: 10 })],
      "GET /loans": [debt({ id: "l1", name: "Car", totalCurrentBalance: 100 })],
      "GET /crypto": [portfolio({ id: "c1" })],
      "GET /crypto/:id": cryptoDetail({ id: "c1", totalCurrentValueEur: 500 }),
      "GET /metals": [], "GET /stocks": [], "GET /properties": [],
      "GET /transactions": page([transaction()]),
    })
    await renderApp(DashboardPage)
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
    expect(await screen.findByText("Net Worth")).toBeInTheDocument()
    // 1000 (bank) + 500 (crypto) − 400 (mortgage) − 100 (loan) = 1000
    await waitFor(() => expect(screen.getAllByText(/1\.000,00/).length).toBeGreaterThan(0))
    expect(api.unmatched).toEqual([])
  })

  test("copes with a brand new, empty account", async () => {
    const api = mockApi({ "GET /accounts": [], "GET /mortgages": [], "GET /loans": [], "GET /crypto": [], "GET /metals": [], "GET /stocks": [], "GET /properties": [], "GET /transactions": page([]) })
    await renderApp(DashboardPage)
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument()
    expect(api.unmatched).toEqual([])
  })
})

describe("Overview", () => {
  const api = () => mockApi({
    "GET /accounts": [account()], "GET /categories": [category()],
    "GET /transactions": page([transaction(), transaction({ id: "t2", description: "Salary", creditDebitIndicator: "CRDT", amount: "2000.00", counterpartyName: "Employer" })]),
    "PATCH /transactions/:id": ({ body }: any) => ({ ...transaction(), ...body }),
  })

  test("Overview lists transactions with signed amounts", async () => {
    const a = api()
    await renderApp(OverviewPage)
    expect(await screen.findByText("Roastery")).toBeInTheDocument()
    expect(screen.getByText("Employer")).toBeInTheDocument()
    expect(a.unmatched).toEqual([])
  })

  test("Overview passes the account from the URL to the query", async () => {
    const a = api()
    await renderApp(OverviewPage, { route: "/overview?account=a1" })
    await screen.findByText("Roastery")
    await waitFor(() => expect(a.calls("GET", "/transactions").some((c) => (c.query.accountIds ?? c.query.accountId ?? "").includes("a1"))).toBe(true))
  })
})

describe("Checking / Savings", () => {
  const accounts = [
    account({ id: "a1", name: "Everyday", iban: "NL01CHEK0000000001", type: "checking", balance: "250.00" }),
    account({ id: "a2", name: "Rainy day", iban: "NL02SAVE0000000002", type: "savings", balance: "9000.00" }),
  ]
  const mock = () => mockApi({ "GET /accounts": accounts, "GET /transactions": page([transaction()]) , "PATCH /accounts/:id": ({ body }: any) => ({ ...accounts[0], ...body }) })

  test("Checking shows only checking accounts", async () => {
    const a = mock()
    await renderApp(CheckingPage)
    expect(await screen.findByText("Everyday")).toBeInTheDocument()
    expect(screen.queryByText("Rainy day")).not.toBeInTheDocument()
    expect(a.unmatched).toEqual([])
  })

  test("Savings shows only savings accounts", async () => {
    const a = mock()
    await renderApp(SavingsPage)
    expect(await screen.findByText("Rainy day")).toBeInTheDocument()
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
    expect(a.unmatched).toEqual([])
  })
})

describe("Subscriptions", () => {
  const setup = async (list = [subscription(), subscription({ id: "s2", status: "confirmed", counterpartyName: "Gym", name: "Gym" })]) => {
    const api = mockApi({
      "GET /subscriptions": list, "GET /accounts": [account()],
      "PATCH /subscriptions/:id": ({ params, body }: any) => ({ ...subscription({ id: params.id }), ...body }),
      "DELETE /subscriptions/:id": respond(204),
      "POST /subscriptions": ({ body }: any) => ({ id: "n", ...body }),
      "POST /subscriptions/detect": { detected: 0 },
      "GET /subscriptions/:id/transactions": [],
    })
    return { api, ...await renderApp(SubscriptionsPage) }
  }

  test("confirmed subscriptions are listed; discovered candidates sit in their own tab with a count", async () => {
    const { api, user } = await setup()
    expect(await screen.findByRole("heading", { name: "Subscriptions" })).toBeInTheDocument()
    expect(await screen.findByText("Gym")).toBeInTheDocument()
    expect(screen.queryByText("Streamly")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Discovered/ }))
    expect(await screen.findByText("Streamly")).toBeInTheDocument()
    expect(api.unmatched).toEqual([])
  })

  test("a discovered candidate can be confirmed", async () => {
    const { api, user } = await setup([subscription()])
    await user.click(await screen.findByRole("button", { name: /Discovered/ }))
    await user.click(await screen.findByRole("button", { name: /Confirm/ }))
    await waitFor(() => expect(api.calls("PATCH", "/subscriptions/s1")).toHaveLength(1))
    expect(api.calls("PATCH", "/subscriptions/s1")[0].body).toMatchObject({ status: "confirmed" })
  })

  test("a discovered candidate can be dismissed", async () => {
    const { api, user } = await setup([subscription()])
    await user.click(await screen.findByRole("button", { name: /Discovered/ }))
    await user.click(await screen.findByRole("button", { name: /Dismiss/ }))
    await waitFor(() => expect(api.calls("PATCH", "/subscriptions/s1")).toHaveLength(1))
    expect(api.calls("PATCH", "/subscriptions/s1")[0].body).toMatchObject({ status: "dismissed" })
  })
})

describe("Profile", () => {
  test("shows identity and changes the theme", async () => {
    const api = mockApi({ "GET /me": me({ theme: "system" }), "PATCH /me": ({ body }: any) => ({ ...me(), ...body }) })
    const { user } = await renderApp(ProfilePage)
    expect(await screen.findByText("Dev User")).toBeInTheDocument()
    expect(screen.getByText("dev@localhost")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /dark/i }))
    await waitFor(() => expect(api.calls("PATCH", "/me")).toHaveLength(1))
    expect(api.calls("PATCH", "/me")[0].body).toEqual({ theme: "dark" })
  })
})

describe("Settings", () => {
  test("renders the account list for administration", async () => {
    const api = mockApi({ "GET /me": me(), "GET /accounts": [account({ name: "Everyday" })], "GET /categories": [category()], "PATCH /accounts/:id": ({ body }: any) => ({ ...account(), ...body }) })
    await renderApp(SettingsPage)
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument()
    expect(await screen.findByText("Everyday")).toBeInTheDocument()
    expect(api.unmatched.filter((u) => !u.startsWith("GET /categories"))).toEqual([])
  })
})

describe("Admin", () => {
  test("lists accounts with their members, then the sharing overview", async () => {
    const api = mockApi({
      "GET /me": me(),
      "GET /admin/accounts": [{ ...account(), members: [{ groupName: "family", role: "editor" }], ownerProfile: { email: "o@x.nl", name: "Owner" } }],
      "GET /admin/sharing": { portfolios: [{ id: "p1", name: "Crypto A", type: "crypto", members: [{ groupName: "friends", role: "viewer" }] }], mortgages: [], loans: [] },
      "POST /admin/accounts/:id/members": ({ body }: any) => body,
      "DELETE /admin/accounts/:id/members/:group": respond(204),
      "PATCH /admin/accounts/:id": ({ body }: any) => ({ ...account(), ...body }),
    })
    const { user } = await renderApp(AdminPage)
    expect(await screen.findByRole("heading", { name: "Administration" })).toBeInTheDocument()
    expect(await screen.findByText("NL05TEST0417164300")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Sharing Overview/ }))
    expect(await screen.findByText("Crypto A")).toBeInTheDocument()
    expect(screen.getByText("friends")).toBeInTheDocument()
    expect(api.unmatched).toEqual([])
  })
})

describe("Layout", () => {
  test("renders the navigation and its children, and fetches the profile", async () => {
    const api = mockApi({ "GET /me": me() })
    await renderApp(Layout, { slots: { default: "<div>page body</div>" } })
    expect(await screen.findByText("page body")).toBeInTheDocument()
    for (const label of ["Dashboard", "Mortgages", "Loans", "Crypto", "Stocks", "Subscriptions"]) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0)
    }
    await waitFor(() => expect(api.calls("GET", "/me").length).toBeGreaterThan(0))
  })
})

describe("Dashboard: non-EUR items", () => {
  const usd = { crypto: cryptoDetail({ id: "c1", currency: "USD", totalCurrentValueEur: 50_000 }) }

  test("a USD portfolio is left out of the net worth, and the page says so", async () => {
    mockApi({
      "GET /accounts": [account({ balance: "1000.00" })], "GET /mortgages": [], "GET /loans": [],
      "GET /crypto": [portfolio({ id: "c1", currency: "USD" })], "GET /crypto/:id": usd.crypto,
      "GET /metals": [], "GET /stocks": [], "GET /properties": [], "GET /transactions": page([]),
    })
    await renderApp(DashboardPage)
    expect(await screen.findByText(/Non-EUR portfolios are excluded from this total/)).toBeInTheDocument()
    // net worth is the €1,000 account only — the $50,000 crypto portfolio is not added to it
    await waitFor(() => expect(screen.getAllByText(/1\.000,00/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/51\.000,00/)).not.toBeInTheDocument()
  })

  test("no note when everything is in euros", async () => {
    mockApi({ "GET /accounts": [account()], "GET /mortgages": [], "GET /loans": [], "GET /crypto": [], "GET /metals": [], "GET /stocks": [], "GET /properties": [], "GET /transactions": page([]) })
    await renderApp(DashboardPage)
    await screen.findByText("Net Worth")
    await waitFor(() => expect(screen.queryByText(/Non-EUR portfolios are excluded/)).not.toBeInTheDocument())
  })
})

describe("Dashboard: property", () => {
  test("a house with equity turns a mortgage-only net worth positive, and has its own tile", async () => {
    mockApi({
      "GET /accounts": [], "GET /mortgages": [debt({ totalCurrentBalance: 300_000, totalMonthlyPayment: 1500 })], "GET /loans": [],
      "GET /crypto": [], "GET /metals": [], "GET /stocks": [], "GET /transactions": page([]),
      "GET /properties": [property({ currentValue: 520_000, debt: 300_000, equity: 220_000 })],
    })
    await renderApp(DashboardPage)
    // net worth = 520.000 (house) − 300.000 (mortgage)
    await waitFor(() => expect(screen.getAllByText(/220\.000,00/).length).toBeGreaterThan(1)) // the net worth hero and the property tile's equity
    const hero = screen.getByText("Net Worth").closest("div")!
    expect(hero).toHaveTextContent("220.000,00")
    expect(hero.querySelector("p.text-5xl")!.className).not.toContain("text-red-600")
    expect(screen.getByText("Property")).toBeInTheDocument()
    expect(screen.getByText(/Equity .*220\.000,00/)).toBeInTheDocument()
  })

  test("without any property the tile shows a dash and the net worth is the debt", async () => {
    mockApi({
      "GET /accounts": [], "GET /mortgages": [debt({ totalCurrentBalance: 300_000 })], "GET /loans": [],
      "GET /crypto": [], "GET /metals": [], "GET /stocks": [], "GET /transactions": page([]), "GET /properties": [],
    })
    await renderApp(DashboardPage)
    const hero = (await screen.findByText("Net Worth")).closest("div")!
    await waitFor(() => expect(hero.querySelector("p.text-5xl")!.className).toContain("text-red-600"))
  })
})
