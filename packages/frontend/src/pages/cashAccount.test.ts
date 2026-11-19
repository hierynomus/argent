import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { cryptoDetail, portfolio, stockDetail } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import CryptoPage from "./Crypto.vue"
import StocksPage from "./Stocks.vue"

const kinds = [
  { name: "crypto", Page: CryptoPage, base: "/crypto", detail: cryptoDetail },
  { name: "stocks", Page: StocksPage, base: "/stocks", detail: stockDetail },
] as const

const movement = (over: object = {}) => ({ id: "m1", portfolioId: "p1", movementDate: "2024-01-05", type: "deposit", amount: "1000.00", notes: null, createdAt: "2024-01-05T00:00:00Z", ...over })

for (const k of kinds) {
  describe(`${k.name}: the cash account behind a portfolio`, () => {
    const setup = async (detail: object = {}, listOver: object = {}) => {
      const api = mockApi({
        [`GET ${k.base}`]: [portfolio({ id: "p1", type: k.name, ...listOver } as any)],
        [`GET ${k.base}/:id`]: k.detail({ id: "p1", type: k.name, ...detail } as any),
        [`POST ${k.base}/:id/cash`]: ({ body }: any) => ({ id: "new", ...body }),
        [`DELETE ${k.base}/:id/cash/:mid`]: respond(204),
        [`PATCH ${k.base}/:id`]: ({ body }: any) => body,
        [`POST ${k.base}`]: ({ body }: any) => ({ id: "new", ...body }),
      })
      return { api, ...(await renderApp(k.Page)) }
    }
    const panel = async () => within(await screen.findByRole("region", { name: "Cash account" }).catch(() => screen.findByLabelText("Cash account")))

    test("shows the account number and the cash, and a Cash tile", async () => {
      await setup({ accountNumber: "NL05 TEST 0417 1643 00", cash: 1234.5 })
      const p = await panel()
      expect(p.getByText("NL05 TEST 0417 1643 00")).toBeInTheDocument()
      expect(p.getAllByText(/1\.234,50/).length).toBeGreaterThan(0)
      expect(screen.getAllByText("Cash").length).toBeGreaterThan(0)
    })

    test("without an account number it says so; a negative balance is shown, not hidden", async () => {
      await setup({ accountNumber: null, cash: -50 })
      const p = await panel()
      expect(p.getByText("No account number")).toBeInTheDocument()
      expect(p.getByText(/50,00/)).toBeInTheDocument()
    })

    test("records a deposit with the validated body", async () => {
      const { api, user } = await setup()
      await user.click(await screen.findByRole("button", { name: "+ Deposit / withdrawal" }))
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0) // the shared schema explains what is missing
      expect(api.calls("POST", `${k.base}/p1/cash`)).toHaveLength(0)
      await user.type(screen.getByLabelText(/Amount/), "1000")
      await user.type(screen.getByLabelText("Date"), "2024-02-01")
      await user.click(screen.getByRole("button", { name: "Save" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/p1/cash`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/p1/cash`)[0].body).toEqual({ type: "deposit", amount: "1000", movementDate: "2024-02-01" })
    })

    test("a withdrawal can be chosen", async () => {
      const { api, user } = await setup()
      await user.click(await screen.findByRole("button", { name: "+ Deposit / withdrawal" }))
      await user.selectOptions(screen.getByLabelText("Type"), "withdrawal")
      await user.type(screen.getByLabelText(/Amount/), "25.5")
      await user.type(screen.getByLabelText("Date"), "2024-02-01")
      await user.click(screen.getByRole("button", { name: "Save" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/p1/cash`)[0].body).toMatchObject({ type: "withdrawal", amount: "25.5" }))
    })

    test("lists the movements (money out in red) and removes one", async () => {
      const { api, user } = await setup({ cashMovements: [movement(), movement({ id: "m2", type: "fee", amount: "2.50", notes: "custody" })] })
      await user.click(await screen.findByRole("button", { name: /Cash movements \(2\)/ }))
      expect(screen.getByText("custody")).toBeInTheDocument()
      expect(screen.getByText(/\+.*1\.000,00/)).toBeInTheDocument()
      expect(screen.getByText(/−.*2,50/)).toBeInTheDocument()
      await user.click(screen.getAllByRole("button", { name: "Delete" })[0])
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/p1/cash/m2`)).toHaveLength(1)) // newest first
    })

    test("edits the account number and the opening cash", async () => {
      const { api, user } = await setup({ accountNumber: "OLD" })
      await user.click(await screen.findByRole("button", { name: "Edit account" }))
      const number = screen.getByLabelText("Account number")
      expect(number).toHaveValue("OLD")
      await user.clear(number)
      await user.type(number, "NL02 INGB 0001 2345 67")
      await user.type(screen.getByLabelText(/Cash on that date/), "300")
      await user.click(screen.getByRole("button", { name: "Save" }))
      expect(await screen.findByText(/openingCashDate is required/)).toBeInTheDocument() // an amount needs its date
      await user.type(screen.getByLabelText("Cash as of"), "2024-03-01")
      await user.click(screen.getByRole("button", { name: "Save" }))
      await waitFor(() => expect(api.calls("PATCH", `${k.base}/p1`)).toHaveLength(1))
      expect(api.calls("PATCH", `${k.base}/p1`)[0].body).toEqual({ accountNumber: "NL02 INGB 0001 2345 67", openingCash: "300", openingCashDate: "2024-03-01" })
    })

    test("a viewer sees the cash but gets no buttons to change it", async () => {
      await setup({ canEdit: false, cash: 10, cashMovements: [movement()] }, { canEdit: false })
      await panel()
      expect(screen.queryByRole("button", { name: "+ Deposit / withdrawal" })).toBeNull()
      expect(screen.queryByRole("button", { name: "Edit account" })).toBeNull()
    })

    test("a new portfolio can be given an account number", async () => {
      const api = mockApi({ [`GET ${k.base}`]: [], [`POST ${k.base}`]: ({ body }: any) => ({ id: "new", ...body }) })
      const { user } = await renderApp(k.Page)
      await user.click(await screen.findByRole("button", { name: "Create portfolio" }))
      await user.type(screen.getByPlaceholderText("Portfolio name"), "Main")
      await user.type(screen.getByLabelText("Account number"), " NL05 TEST 0417 1643 00 ")
      await user.click(screen.getByRole("button", { name: "Create" }))
      await waitFor(() => expect(api.calls("POST", k.base)).toHaveLength(1))
      expect(api.calls("POST", k.base)[0].body).toMatchObject({ name: "Main", accountNumber: "NL05 TEST 0417 1643 00" })
    })
  })
}
