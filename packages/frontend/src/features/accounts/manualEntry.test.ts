import { describe, expect, test } from "vitest"
import { mockApi } from "../../../test/fakeApi"
import { account, category, page, transaction } from "../../../test/fixtures"
import { renderApp, screen, waitFor } from "../../../test/render"
import AccountsOverview from "./AccountsOverview.vue"
import AccountDetail from "../../pages/AccountDetail.vue"
import TransactionDetail from "../transactions/TransactionDetail.vue"

const CASH_ID = "6f1d2c9e-3b7a-4e5f-8a10-2b9c4d7e1f30"
const cash = account({ id: CASH_ID, name: "Wallet", type: "cash", source: "manual", iban: "manual:123", balance: "35.00" })

const mock = (accounts = [cash]) =>
  mockApi({
    "GET /accounts": accounts,
    "GET /transactions": page([]),
    "GET /categories": [category()],
    "POST /accounts": ({ body }: any) => ({ ...cash, ...body, id: "new" }),
    "POST /transactions": ({ body }: any) => ({ id: "t9", ...body }),
    "DELETE /accounts/:id": () => null,
    "PATCH /accounts/:id": ({ body }: any) => ({ ...cash, ...body }),
  })

/** the overview, where accounts are added */
const setup = async (accounts = [cash]) => {
  const api = mock(accounts)
  return { api, ...(await renderApp(AccountsOverview)) }
}
/** one account's page, where its transactions are added and the account is changed or deleted */
const setupDetail = async (accounts = [cash]) => {
  const api = mock(accounts)
  const routes = [{ path: "/accounts/:id", component: AccountDetail }, { path: "/accounts", component: { render: () => null } }]
  return { api, ...(await renderApp(AccountDetail, { route: `/accounts/${CASH_ID}`, routes })) }
}

describe("accounts and transactions entered by hand", () => {
  test("a manual account shows its name but not the placeholder IBAN", async () => {
    await setup()
    expect(await screen.findByText("Wallet")).toBeInTheDocument()
    expect(screen.queryByText(/manual:/)).not.toBeInTheDocument()
  })

  test("adds a cash account: no IBAN field for cash, and the holder is sent", async () => {
    const { api, user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ Add account" }))
    await user.click(screen.getByRole("button", { name: "cash" }))
    expect(screen.queryByLabelText(/IBAN/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText("Name"), "Home safe")
    await user.type(screen.getByLabelText(/Holder/), "Joint")
    await user.type(screen.getByLabelText(/Balance/), "120")
    await user.click(screen.getByRole("button", { name: "Add account" }))
    await waitFor(() => expect(api.calls("POST", "/accounts")).toHaveLength(1))
    expect(api.calls("POST", "/accounts")[0].body).toMatchObject({ name: "Home safe", type: "cash", holder: "Joint", currency: "EUR", openingBalance: "120" })
  })

  test("asks for a name instead of calling the API", async () => {
    const { api, user } = await setup([])
    await user.click(await screen.findByRole("button", { name: "+ Add account" }))
    await user.click(screen.getByRole("button", { name: "Add account" }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(api.calls("POST", "/accounts")).toHaveLength(0)
  })

  test("adds a payment from the account page: out by default, in the account's currency", async () => {
    const { api, user } = await setupDetail()
    await user.click(await screen.findByRole("button", { name: "+ Add transaction" }))
    await user.type(screen.getByLabelText(/Amount/), "4.50")
    await user.type(screen.getByLabelText("Who / where"), "Bakery")
    await user.click(screen.getByRole("button", { name: "Add transaction" }))
    await waitFor(() => expect(api.calls("POST", "/transactions")).toHaveLength(1))
    expect(api.calls("POST", "/transactions")[0].body).toMatchObject({ accountId: CASH_ID, direction: "DBIT", amount: "4.50", counterpartyName: "Bakery" })
  })

  test("money in sends CRDT, and a zero amount is refused", async () => {
    const { api, user } = await setupDetail()
    await user.click(await screen.findByRole("button", { name: "+ Add transaction" }))
    await user.click(screen.getByRole("button", { name: "In" }))
    await user.type(screen.getByLabelText(/Amount/), "0")
    await user.click(screen.getByRole("button", { name: "Add transaction" }))
    expect(await screen.findByText(/greater than 0/)).toBeInTheDocument()
    expect(api.calls("POST", "/transactions")).toHaveLength(0)
    await user.clear(screen.getByLabelText(/Amount/))
    await user.type(screen.getByLabelText(/Amount/), "10")
    await user.click(screen.getByRole("button", { name: "Add transaction" }))
    await waitFor(() => expect(api.calls("POST", "/transactions")[0].body).toMatchObject({ direction: "CRDT", amount: "10" }))
  })

  test("an account can be deleted after confirming", async () => {
    const { api, user } = await setupDetail()
    await user.click(await screen.findByRole("button", { name: "Delete account" }))
    await user.click(screen.getByRole("button", { name: "Yes, delete" }))
    await waitFor(() => expect(api.calls("DELETE", `/accounts/${CASH_ID}`)).toHaveLength(1))
  })
})

describe("transaction details", () => {
  const manualTx = transaction({ isManual: true, account: cash, accountId: CASH_ID })
  const mount = async (tx = manualTx) => {
    const api = mockApi({
      "GET /categories": [category()],
      "GET /transactions/:id/transfer-suggestions": [],
      "DELETE /transactions/:id": () => null,
      "PUT /transactions/:id": ({ body }: any) => ({ ...tx, ...body }),
    })
    return { api, ...(await renderApp(TransactionDetail, { props: { tx, labels: [] } })) }
  }

  test("a hand-entered transaction can be deleted and edited", async () => {
    const { api, user } = await mount()
    expect(screen.getByText("Entered by hand")).toBeInTheDocument()
    expect(screen.queryByText(/manual:/)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await user.clear(screen.getByLabelText(/Amount/))
    await user.type(screen.getByLabelText(/Amount/), "13")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(api.calls("PUT", "/transactions/t1")[0].body).toMatchObject({ amount: "13" }))
  })

  test("a bank transaction has no edit or delete", async () => {
    await mount(transaction())
    expect(screen.queryByText("Entered by hand")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()
  })
})
