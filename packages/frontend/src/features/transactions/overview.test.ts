import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../../test/fakeApi"
import { account, category, page, transaction } from "../../../test/fixtures"
import { renderApp, screen, waitFor } from "../../../test/render"
import OverviewPage from "../../pages/Overview.vue"
import { subscriptionTargetOf } from "./bulk"

const TXS = [
  transaction({ id: "t1", description: "Coffee beans", counterpartyName: "Roastery", counterpartyIban: "NL00ROAS0000000001", amount: "12.50" }),
  transaction({ id: "t2", description: "More coffee", counterpartyName: "Roastery", counterpartyIban: "NL00ROAS0000000001", amount: "9.00" }),
  transaction({ id: "t3", description: "Salary", counterpartyName: "Employer", counterpartyIban: "NL00EMPL0000000001", creditDebitIndicator: "CRDT", amount: "2000.00" }),
]

const setup = async (extra: Record<string, any> = {}, txs = TXS) => {
  const api = mockApi({
    "GET /accounts": [account()], "GET /categories": [category({ id: "c1", name: "Groceries", color: "#00aa00" }), category({ id: "c2", name: "Fun" })],
    "GET /transactions": () => page(txs),
    "PATCH /transactions/:id": ({ body }: any) => body,
    "POST /subscriptions": ({ body }: any) => ({ id: "sub1", ...body }),
    ...extra,
  })
  const utils = await renderApp(OverviewPage, {
    route: "/overview",
    routes: [{ path: "/subscriptions", component: { template: "<h1>Subscriptions page</h1>" } }],
  })
  return { api, ...utils }
}

describe("subscriptionTargetOf", () => {
  const rows = TXS
  test("null when nothing is selected", async () => expect(subscriptionTargetOf(rows, new Set())).toBeNull())
  test("the shared counterparty when all selected rows are payments to the same IBAN on one account", async () => {
    expect(subscriptionTargetOf(rows, new Set(["t1", "t2"]))).toEqual({ accountId: "a1", counterpartyIban: "NL00ROAS0000000001", counterpartyName: "Roastery" })
  })
  test("null when the selection mixes counterparties", async () => expect(subscriptionTargetOf(rows, new Set(["t1", "t3"]))).toBeNull())
  test("null when the selection mixes accounts", async () => {
    const mixed = [transaction({ id: "x", accountId: "a1", counterpartyIban: "NL1" }), transaction({ id: "y", accountId: "a2", counterpartyIban: "NL1" })]
    expect(subscriptionTargetOf(mixed, new Set(["x", "y"]))).toBeNull()
  })
  test("transfers and rows without an IBAN are not eligible", async () => {
    const rs = [transaction({ id: "x", counterpartyIban: null }), transaction({ id: "y", counterpartyIban: "NL1", transferPeerId: "z" })]
    expect(subscriptionTargetOf(rs, new Set(["x", "y"]))).toBeNull()
  })
})

describe("Overview: listing & filtering", () => {
  test("lists transactions, with signed amounts and the total count", async () => {
    await setup()
    expect(await screen.findAllByText("Roastery")).toHaveLength(2)
    expect(screen.getByText("Employer")).toBeInTheDocument()
    expect(screen.getByText("3 transactions")).toBeInTheDocument()
  })

  test("an empty result says so", async () => {
    await setup({}, [])
    expect(await screen.findByText("No transactions found.")).toBeInTheDocument()
  })

  test("typing in the search box queries the API (and goes back to page 1)", async () => {
    const { api, user } = await setup()
    await screen.findByText("Employer")
    await user.type(screen.getByLabelText("Search description"), "coffee")
    await waitFor(() => expect(api.calls("GET", "/transactions").some((c) => c.query.search === "coffee" && c.query.page === "1")).toBe(true))
  })

  test("date range and label filters are sent too", async () => {
    const { api, user } = await setup()
    await screen.findByText("Employer")
    await user.type(screen.getByLabelText("From date"), "2024-01-01")
    await user.type(screen.getByLabelText("To date"), "2024-02-01")
    await user.selectOptions(screen.getByLabelText("Label"), "uncategorized")
    await waitFor(() => {
      const last = api.calls("GET", "/transactions").at(-1)!
      expect(last.query).toMatchObject({ from: "2024-01-01", to: "2024-02-01", categoryId: "uncategorized" })
    })
  })

  test("the account chips restrict the query to the chosen accounts", async () => {
    const { api, user } = await setup()
    await screen.findByText("Employer")
    await user.click(await screen.findByRole("button", { name: /Checking/ }))
    await waitFor(() => expect(api.calls("GET", "/transactions").some((c) => c.query.accountIds === "a1")).toBe(true))
  })

  test("pagination: Next/Prev move through pages and are disabled at the ends", async () => {
    const many = Array.from({ length: 50 }, (_, i) => transaction({ id: `t${i}`, description: `row ${i}` }))
    const api = mockApi({
      "GET /accounts": [account()], "GET /categories": [],
      "GET /transactions": () => ({ data: many, total: 120, page: 1, pageSize: 50 }),
    })
    const { user } = await renderApp(OverviewPage)
    await screen.findByText("row 0")
    expect(screen.getByText("120 transactions")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(api.calls("GET", "/transactions").some((c) => c.query.page === "2")).toBe(true))
    expect(await screen.findByText("Page 2")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("Page 3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled() // 3 × 50 ≥ 120
    await user.click(screen.getByRole("button", { name: "Prev" }))
    expect(await screen.findByText("Page 2")).toBeInTheDocument()
  })

  test("transfers show the other account instead of a counterparty", async () => {
    await setup({}, [transaction({ id: "tt", counterpartyName: "ignored", transferPeerId: "p", transferPeer: { id: "p", accountId: "a2", account: account({ id: "a2", name: "Savings pot" }) } as any })])
    expect(await screen.findByText(/↔ Savings pot/)).toBeInTheDocument()
    expect(screen.queryByText("ignored")).not.toBeInTheDocument()
  })
})

describe("Overview: selecting and bulk actions", () => {
  test("selecting rows shows the action bar with a count; Clear dismisses it", async () => {
    const { user } = await setup()
    await screen.findByText("Employer")
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument()
    await user.click(screen.getByLabelText("Select transaction Coffee beans"))
    expect(screen.getByText("1 selected")).toBeInTheDocument()
    await user.click(screen.getByLabelText("Select transaction Salary"))
    expect(screen.getByText("2 selected")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument()
  })

  test("'select all' toggles every row on the page", async () => {
    const { user } = await setup()
    await screen.findByText("Employer")
    await user.click(screen.getByLabelText("Select all on this page"))
    expect(screen.getByText("3 selected")).toBeInTheDocument()
    await user.click(screen.getByLabelText("Select all on this page"))
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument()
  })

  test("clicking a checkbox does not open the detail panel", async () => {
    const { user } = await setup()
    await screen.findByText("Employer")
    await user.click(screen.getByLabelText("Select transaction Salary"))
    expect(screen.queryByText("Transaction Details")).not.toBeInTheDocument()
  })

  test("applies a label to every selected row", async () => {
    const { api, user } = await setup()
    await screen.findByText("Employer")
    await user.click(screen.getByLabelText("Select transaction Coffee beans"))
    await user.click(screen.getByLabelText("Select transaction More coffee"))
    await user.selectOptions(screen.getByLabelText("Label to apply"), "c1")
    await user.click(screen.getByRole("button", { name: "Apply label" }))
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(2))
    expect(api.calls("PATCH").map((c) => c.path).sort()).toEqual(["/transactions/t1", "/transactions/t2"])
    expect(api.calls("PATCH").every((c) => c.body.categoryId === "c1")).toBe(true)
    await waitFor(() => expect(screen.queryByText(/selected$/)).not.toBeInTheDocument()) // selection cleared
  })

  test("'Unlabeled' removes the label", async () => {
    const { api, user } = await setup()
    await screen.findByText("Employer")
    await user.click(screen.getByLabelText("Select transaction Salary"))
    await user.click(screen.getByRole("button", { name: "Apply label" }))
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(1))
    expect(api.calls("PATCH")[0].body).toEqual({ categoryId: null })
  })

  test("a failing bulk label is reported in the bar (and the selection is kept)", async () => {
    const { user } = await setup({ "PATCH /transactions/:id": respond(403, { error: "Not found" }) })
    await screen.findByText("Employer")
    await user.click(screen.getByLabelText("Select transaction Salary"))
    await user.click(screen.getByRole("button", { name: "Apply label" }))
    expect(await screen.findByText("Not found")).toBeInTheDocument()
    expect(screen.getByText("1 selected")).toBeInTheDocument()
  })

  test("same-counterparty rows can become a subscription; it navigates to the subscriptions page", async () => {
    const { api, user, router } = await setup()
    await screen.findAllByText("Roastery")
    await user.click(screen.getByLabelText("Select transaction Coffee beans"))
    await user.click(screen.getByLabelText("Select transaction More coffee"))
    await user.click(screen.getByRole("button", { name: /Create subscription/ }))
    expect(screen.getByText(/↻ Roastery/)).toBeInTheDocument()
    await user.type(screen.getByLabelText("Subscription name"), "  Coffee club ")
    await user.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => expect(api.calls("POST", "/subscriptions")).toHaveLength(1))
    expect(api.calls("POST", "/subscriptions")[0].body).toEqual({ accountId: "a1", counterpartyIban: "NL00ROAS0000000001", name: "Coffee club" })
    await waitFor(() => expect(router.currentRoute.value.path).toBe("/subscriptions"))
  })

  test("no subscription option when the selection spans different counterparties", async () => {
    const { user } = await setup()
    await screen.findByText("Employer")
    await user.click(screen.getByLabelText("Select transaction Coffee beans"))
    await user.click(screen.getByLabelText("Select transaction Salary"))
    expect(screen.queryByRole("button", { name: /Create subscription/ })).not.toBeInTheDocument()
  })

  test("a failed subscription creation shows the error inline instead of a browser alert", async () => {
    const { user, router } = await setup({ "POST /subscriptions": respond(409, { error: "A subscription for this account + IBAN already exists" }) })
    await screen.findAllByText("Roastery")
    await user.click(screen.getByLabelText("Select transaction Coffee beans"))
    await user.click(screen.getByRole("button", { name: /Create subscription/ }))
    await user.click(screen.getByRole("button", { name: "Create" }))
    expect(await screen.findByText("A subscription for this account + IBAN already exists")).toBeInTheDocument()
    expect(router.currentRoute.value.path).not.toBe("/subscriptions") // stayed put
  })

  test("Escape leaves subscription mode without creating anything", async () => {
    const { api, user } = await setup()
    await screen.findAllByText("Roastery")
    await user.click(screen.getByLabelText("Select transaction Coffee beans"))
    await user.click(screen.getByRole("button", { name: /Create subscription/ }))
    await user.type(screen.getByLabelText("Subscription name"), "x{Escape}")
    expect(screen.getByRole("button", { name: "Apply label" })).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })
})

describe("Overview: transaction detail", () => {
  test("clicking a row opens its details, and the close button hides them", async () => {
    const { user } = await setup()
    await user.click((await screen.findByText("Salary")).closest("tr")!)
    expect(await screen.findByText("Transaction Details")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /close/i }))
    await waitFor(() => expect(screen.queryByText("Transaction Details")).not.toBeInTheDocument())
  })
})

describe("legacy ?account= link", () => {
  test("the Checking/Savings cards link here with the account preselected", async () => {
    const api = mockApi({ "GET /accounts": [account()], "GET /categories": [], "GET /transactions": page(TXS) })
    await renderApp(OverviewPage, { route: "/overview?account=a1" })
    await screen.findAllByText("Roastery")
    expect(api.calls("GET", "/transactions")[0].query.accountIds).toBe("a1")
  })
})

describe("a selection from the spending card", () => {
  const link = "/overview?categories=c1,c2&from=2026-11-01&to=2026-11-30&direction=DBIT&excludeTransfers=1&currency=EUR&label=Food"

  test("asks for exactly those transactions and says so, and the chip clears it", async () => {
    const api = mockApi({ "GET /accounts": [account()], "GET /categories": [category({ id: "c1", name: "Groceries" })], "GET /transactions": page(TXS) })
    const { user } = await renderApp(OverviewPage, { route: link })
    await screen.findAllByText("Roastery")
    expect(api.calls("GET", "/transactions")[0].query).toMatchObject({ categoryIds: "c1,c2", from: "2026-11-01", to: "2026-11-30", direction: "DBIT", excludeTransfers: "true", currency: "EUR" })
    const chip = screen.getByLabelText("Selection from the dashboard")
    expect(chip).toHaveTextContent("Food")
    expect(chip).toHaveTextContent("money out")

    await user.click(screen.getByRole("button", { name: /Clear/ }))
    expect(screen.queryByLabelText("Selection from the dashboard")).toBeNull()
    await waitFor(() => {
      const last = api.calls("GET", "/transactions").at(-1)!.query
      expect(last.categoryIds).toBeUndefined()
      expect(last.direction).toBeUndefined()
    })
  })

  test("picking a label by hand replaces the selection", async () => {
    const api = mockApi({ "GET /accounts": [account()], "GET /categories": [category({ id: "c1", name: "Groceries" })], "GET /transactions": page(TXS) })
    const { user } = await renderApp(OverviewPage, { route: link })
    await screen.findAllByText("Roastery")
    await user.selectOptions(screen.getByLabelText("Label"), "c1")
    expect(screen.queryByLabelText("Selection from the dashboard")).toBeNull()
    await waitFor(() => {
      const last = api.calls("GET", "/transactions").at(-1)!.query
      expect(last.categoryId).toBe("c1")
      expect(last.categoryIds).toBeUndefined()
    })
  })
})
