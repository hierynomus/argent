import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../../test/fakeApi"
import { account } from "../../../test/fixtures"
import { renderApp, screen, waitFor } from "../../../test/render"
import AccountsTab from "./AccountsTab.vue"

const setup = async (accounts = [account({ id: "a1", name: "Everyday", iban: "NL01CHEK0000000001", balance: "1234.50", openingBalance: "100.00", openingBalanceDate: "2024-01-01" }), account({ id: "a2", name: null, iban: "NL02SAVE0000000002", type: "savings", balance: "9000.00", openingBalance: "0.00", openingBalanceDate: null })], extra: Record<string, any> = {}) => {
  const api = mockApi({ "GET /accounts": accounts, "PATCH /accounts/:id": ({ body }: any) => ({ ...accounts[0], ...body }), ...extra })
  return { api, ...await renderApp(AccountsTab) }
}

describe("AccountsTab", () => {
  test("lists every account with IBAN, name, type, and a Dutch-formatted balance", async () => {
    await setup()
    expect(await screen.findByText("NL01CHEK0000000001")).toBeInTheDocument()
    expect(screen.getByText("Everyday")).toBeInTheDocument()
    expect(screen.getByText("No name set")).toBeInTheDocument()
    expect(screen.getByText("Checking")).toBeInTheDocument()
    expect(screen.getByText("Savings")).toBeInTheDocument()
    expect(screen.getByText(/1\.234,50/)).toBeInTheDocument() // nl-NL: dot thousands, comma decimals
  })

  test("says so when there are no accounts", async () => {
    await setup([])
    expect(await screen.findByText(/No accounts yet/)).toBeInTheDocument()
  })

  test("editing pre-fills the form from the account", async () => {
    const { user } = await setup()
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0])
    expect(screen.getByLabelText("Name")).toHaveValue("Everyday")
    expect(screen.getByLabelText(/Opening balance/)).toHaveValue(100)
    expect(screen.getByLabelText("As of date")).toHaveValue("2024-01-01")
    expect(screen.getByRole("button", { name: "checking" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(/Balance calculated from 2024-01-01/)).toBeInTheDocument()
  })

  test("saves a new name, type and opening balance", async () => {
    const { api, user } = await setup()
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0])
    const name = screen.getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Joint account")
    await user.click(screen.getByRole("button", { name: "savings" }))
    const opening = screen.getByLabelText(/Opening balance/)
    await user.clear(opening)
    await user.type(opening, "250.75")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH", "/accounts/a1")).toHaveLength(1))
    expect(api.calls("PATCH", "/accounts/a1")[0].body).toEqual({ name: "Joint account", type: "savings", openingBalance: "250.75", openingBalanceDate: "2024-01-01" })
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()) // form closes
  })

  test("a blank name is sent as blank, so it actually clears the name", async () => {
    const { api, user } = await setup()
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0])
    await user.clear(screen.getByLabelText("Name"))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(1))
    expect(api.calls("PATCH")[0].body.name).toBe("")
  })

  test("clearing the date sends null", async () => {
    const { api, user } = await setup()
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0])
    await user.clear(screen.getByLabelText("As of date"))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PATCH")).toHaveLength(1))
    expect(api.calls("PATCH")[0].body.openingBalanceDate).toBeNull()
  })

  test("Cancel closes the form without saving", async () => {
    const { api, user } = await setup()
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0])
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
    expect(api.calls("PATCH")).toHaveLength(0)
  })

  test("only one account is edited at a time; the Edit button hides while editing", async () => {
    const { user } = await setup()
    const edits = await screen.findAllByRole("button", { name: "Edit" })
    expect(edits).toHaveLength(2)
    await user.click(edits[0])
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Edit" })) // switch to the second account
    expect(screen.getAllByLabelText("Name")).toHaveLength(1) // the form moved; it is never open twice
    expect(screen.getByLabelText("Name")).toHaveValue("") // ...and now belongs to the unnamed account
  })

  test("server errors are shown in the form", async () => {
    const { user } = await setup(undefined, { "PATCH /accounts/:id": respond(403, { error: "Forbidden" }) })
    await user.click((await screen.findAllByRole("button", { name: "Edit" }))[0])
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Forbidden")).toBeInTheDocument()
  })
})
