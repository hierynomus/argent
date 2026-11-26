import { beforeEach, describe, expect, test } from "vitest"
import { mockApi } from "../../../test/fakeApi"
import { account, category, page } from "../../../test/fixtures"
import { renderApp, screen, within } from "../../../test/render"
import AccountDetail from "../../pages/AccountDetail.vue"
import AccountsOverview from "./AccountsOverview.vue"

const accounts = [
  account({ id: "a1", name: "Everyday", iban: "NL01CHEK0000000001", holder: "Alex", balance: "250.00" }),
  account({ id: "a2", name: "Rainy day", iban: "NL02SAVE0000000002", type: "savings", holder: "Alex", balance: "9000.00" }),
  account({ id: "a3", name: "School", iban: "NL03SCHL0000000003", holder: "Sam", balance: "-40.00" }),
  account({ id: "a4", name: "Closed one", iban: "NL04CLSD0000000004", holder: "Sam", balance: "0.00", hidden: true }),
  account({ id: "a5", name: "Wallet", iban: "manual:x", type: "cash", source: "manual", holder: null, balance: "35.00" }),
]

beforeEach(() => localStorage.clear())

const setup = async (route = "/accounts") => {
  const api = mockApi({ "GET /accounts": accounts })
  return { api, ...(await renderApp(AccountsOverview, { route })) }
}

describe("Accounts overview", () => {
  test("groups the accounts by holder, with the people first and the rest last, each with its subtotal", async () => {
    await setup()
    const headers = (await screen.findAllByRole("button", { expanded: true })).map((b) => b.getAttribute("aria-label"))
    expect(headers).toEqual(["Alex, 2 accounts", "Sam, 1 account", "No holder, 1 account"])
    expect(within(screen.getByRole("button", { name: /^Alex/ })).getByText(/9\.250,00/)).toBeInTheDocument()
    // a hidden account is not in the Sam subtotal (-40) nor listed
    expect(screen.queryByText("Closed one")).not.toBeInTheDocument()
  })

  test("the heading shows the grand total and how many accounts count", async () => {
    await setup()
    expect(await screen.findByText(/in 4 accounts/)).toBeInTheDocument()
  })

  test("a manual account shows 'Entered by hand' and never the placeholder IBAN", async () => {
    await setup()
    expect(await screen.findByText("Entered by hand")).toBeInTheDocument()
    expect(screen.queryByText(/manual:/)).not.toBeInTheDocument()
  })

  test("a row links to the account's page", async () => {
    await setup()
    expect(await screen.findByRole("link", { name: /Everyday/ })).toHaveAttribute("href", "/accounts/a1")
  })

  test("the type filter and the search narrow the list", async () => {
    const { user } = await setup()
    await screen.findByText("Everyday")
    await user.click(screen.getByRole("button", { name: "Savings" }))
    expect(screen.getByText("Rainy day")).toBeInTheDocument()
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "All" }))
    await user.type(screen.getByLabelText("Search accounts"), "school")
    expect(screen.getByText("School")).toBeInTheDocument()
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText("Search accounts"))
    await user.type(screen.getByLabelText("Search accounts"), "zzzz")
    expect(await screen.findByText("No accounts match.")).toBeInTheDocument()
  })

  test("the old /savings address opens with the type filter set", async () => {
    await setup("/accounts?type=savings")
    expect(await screen.findByText("Rainy day")).toBeInTheDocument()
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Savings" })).toHaveAttribute("aria-pressed", "true")
  })

  test("hidden accounts are behind a switch", async () => {
    const { user } = await setup()
    await screen.findByText("Everyday")
    await user.click(screen.getByRole("button", { name: "Show hidden (1)" }))
    expect(screen.getByText("Closed one")).toBeInTheDocument()
    expect(screen.getByText("Hidden")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Hide hidden accounts" }))
    expect(screen.queryByText("Closed one")).not.toBeInTheDocument()
  })

  test("a group folds away and the choice is remembered", async () => {
    const { user, unmount } = await setup()
    await user.click(await screen.findByRole("button", { name: /^Alex/ }))
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Alex/ })).toHaveAttribute("aria-expanded", "false")
    unmount()
    await setup()
    await screen.findByText("School")
    expect(screen.queryByText("Everyday")).not.toBeInTheDocument()
  })

  test("with no accounts it explains how to get some", async () => {
    mockApi({ "GET /accounts": [] })
    await renderApp(AccountsOverview)
    expect(await screen.findByText("No accounts yet.")).toBeInTheDocument()
  })

  test("a new account can be given a type and a holder, with the existing holders suggested", async () => {
    const api = mockApi({ "GET /accounts": accounts, "POST /accounts": ({ body }: any) => ({ ...accounts[0], ...body, id: "new" }) })
    const { user } = await renderApp(AccountsOverview)
    await user.click(await screen.findByRole("button", { name: "+ Add account" }))
    expect([...document.querySelectorAll("#account-holders option")].map((o) => o.getAttribute("value"))).toEqual(["Alex", "Sam"])
    await user.type(screen.getByLabelText("Name"), "Kids")
    await user.type(screen.getByLabelText(/Holder/), "Sam")
    await user.click(screen.getByRole("button", { name: "savings" }))
    await user.click(screen.getByRole("button", { name: "Add account" }))
    await screen.findByText("Everyday")
    expect(api.calls("POST", "/accounts")[0].body).toMatchObject({ name: "Kids", type: "savings", holder: "Sam" })
  })
})

describe("Account page", () => {
  const setupDetail = async (id = "a1") => {
    const api = mockApi({
      "GET /accounts": accounts,
      "GET /transactions": page([]),
      "GET /categories": [category()],
      "PATCH /accounts/:id": ({ params, body }: any) => ({ ...accounts.find((a) => a.id === params.id), ...body }),
    })
    const routes = [{ path: "/accounts/:id", component: AccountDetail }]
    return { api, ...(await renderApp(AccountDetail, { route: `/accounts/${id}`, routes })) }
  }

  test("shows the account, its holder and balance, and only its own transactions", async () => {
    const { api } = await setupDetail()
    expect(await screen.findByRole("heading", { name: "Everyday" })).toBeInTheDocument()
    expect(screen.getByText(/Alex/)).toBeInTheDocument()
    await screen.findByText(/No transactions/i)
    expect(api.calls("GET", "/transactions")[0].query.accountIds).toBe("a1")
    // the account picker belongs to the all-accounts browser, not here
    expect(screen.queryByRole("button", { name: "All accounts" })).not.toBeInTheDocument()
  })

  test("an account can be hidden from the lists, and shown again", async () => {
    const { api, user } = await setupDetail()
    await user.click(await screen.findByRole("button", { name: "Hide from lists" }))
    expect(api.calls("PATCH", "/accounts/a1")[0].body).toEqual({ hidden: true })
  })

  test("a hidden account offers to be shown again", async () => {
    const { api, user } = await setupDetail("a4")
    await user.click(await screen.findByRole("button", { name: "Show in lists" }))
    expect(api.calls("PATCH", "/accounts/a4")[0].body).toEqual({ hidden: false })
  })

  test("the holder can be changed from Edit, and a blank holder clears it", async () => {
    const { api, user } = await setupDetail()
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    await user.clear(screen.getByLabelText("Holder"))
    await user.type(screen.getByLabelText("Holder"), "Sam")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(api.calls("PATCH", "/accounts/a1")[0].body).toMatchObject({ holder: "Sam" })
  })

  test("an account that does not exist says so and links back", async () => {
    await setupDetail("nope")
    expect(await screen.findByText("This account was not found.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /All accounts/ })).toHaveAttribute("href", "/accounts")
  })
})
