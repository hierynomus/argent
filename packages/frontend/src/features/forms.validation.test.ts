import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { cryptoDetail, debt, lot, metalDetail, portfolio, stockDetail, stockPosition } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import MortgagesPage from "../pages/Mortgages.vue"
import CryptoPage from "../pages/Crypto.vue"
import StocksPage from "../pages/Stocks.vue"
import MetalsPage from "../pages/Metals.vue"

/**
 * Forms check their values against the shared request schemas (the same ones the backend enforces),
 * so mistakes are explained next to the field and nothing is sent until the form is valid.
 */

describe("debt forms", () => {
  const setup = async () => {
    const api = mockApi({
      "GET /mortgages": [debt()],
      "POST /mortgages/:id/parts": ({ body }: any) => ({ id: "np", ...body }),
      "POST /mortgages/:id/parts/:pid/payments": ({ body }: any) => ({ id: "ep", ...body }),
      "PATCH /mortgages/:id/parts/:pid": ({ body }: any) => body,
    })
    return { api, ...await renderApp(MortgagesPage) }
  }

  async function fillPart(user: any, over: { principal?: string; start?: string; term?: string } = {}) {
    await user.type(screen.getByPlaceholderText("Part A"), "Fixed")
    await user.type(screen.getByPlaceholderText("200000"), over.principal ?? "150000")
    await user.type(screen.getByPlaceholderText("3.500"), "3.5")
    await user.type(screen.getByLabelText("Start date"), over.start ?? "2024-01-01")
    await user.type(screen.getByLabelText("Term (months)"), over.term ?? "240")
  }

  test("a term of zero months is explained on the term field, and nothing is sent", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Add part" }))
    await fillPart(user, { term: "0" })
    await user.click(screen.getByRole("button", { name: "Add part" }))
    expect(await screen.findByText("The term must be at least 1 month")).toBeInTheDocument()
    expect(screen.getByLabelText("Term (months)")).toHaveAttribute("aria-invalid", "true")
    expect(api.calls("POST", "/mortgages/d1/parts")).toHaveLength(0)
  })

  test("a zero principal is rejected; fixing it lets the form through", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Add part" }))
    await fillPart(user, { principal: "0" })
    await user.click(screen.getByRole("button", { name: "Add part" }))
    expect(await screen.findByText("principal must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST", "/mortgages/d1/parts")).toHaveLength(0)

    const principal = screen.getByLabelText("Principal (EUR)") as HTMLInputElement
    await user.clear(principal)
    await user.type(principal, "150000")
    await user.click(screen.getByRole("button", { name: "Add part" }))
    await waitFor(() => expect(api.calls("POST", "/mortgages/d1/parts")).toHaveLength(1))
    expect(screen.queryByText("principal must be greater than 0")).not.toBeInTheDocument()
  })

  test("an extra payment of zero is rejected", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Payments" }))
    await user.type(screen.getByLabelText("Date"), "2024-02-01")
    await user.type(screen.getByLabelText(/^Amount/), "0")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("amount must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST", "/mortgages/d1/parts/part-1/payments")).toHaveLength(0)
  })

  test("editing a part: a negative rate is rejected", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Edit" }))
    const rate = screen.getByLabelText("Rate (%)") as HTMLInputElement
    await user.clear(rate)
    await user.type(rate, "-1")
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("annualInterestRate must not be negative")).toBeInTheDocument()
    expect(api.calls("PATCH")).toHaveLength(0)
  })
})

describe("investment forms", () => {
  test("crypto: buying a coin with the portfolio's own currency symbol is rejected on the symbol field", async () => {
    const api = mockApi({ "GET /crypto": [portfolio({ id: "p1" })], "GET /crypto/:id": cryptoDetail({ id: "p1" }), "POST /crypto/:id/trades": {} })
    const { user } = await renderApp(CryptoPage)
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.type(screen.getByPlaceholderText("BTC"), "eur")
    await user.type(screen.getByPlaceholderText("0.5"), "1")
    await user.type(screen.getByPlaceholderText("20000"), "100")
    await user.type(screen.getByLabelText("Date"), "2024-03-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    expect(await screen.findByText("fromSymbol and toSymbol must differ")).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("crypto: a zero amount is reported on the right field for a sell", async () => {
    const detail = cryptoDetail({
      id: "p1",
      positions: [{ symbol: "BTC", name: "Bitcoin", assetForm: null, balance: 1, avgCostBasis: 1, totalCostEur: 1, realizedPnL: 0, currentPrice: null, currentValueEur: null, unrealizedPnL: null }],
    })
    const api = mockApi({ "GET /crypto": [portfolio({ id: "p1" })], "GET /crypto/:id": detail, "POST /crypto/:id/trades": {} })
    const { user } = await renderApp(CryptoPage)
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.click(screen.getByRole("button", { name: "sell" }))
    await user.selectOptions(screen.getByLabelText("From symbol"), "BTC")
    await user.type(screen.getByPlaceholderText("0.5"), "0") // amount sold
    await user.type(screen.getByPlaceholderText("20000"), "100")
    await user.type(screen.getByLabelText("Date"), "2024-03-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    expect(await screen.findByText("fromAmount must be greater than 0")).toBeInTheDocument()
    expect(screen.getByLabelText("Amount sold")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("EUR received")).not.toHaveAttribute("aria-invalid")
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("stocks: zero shares are rejected", async () => {
    const api = mockApi({ "GET /stocks": [portfolio({ id: "s1", type: "stocks" })], "GET /stocks/:id": stockDetail({ id: "s1" }), "GET /stocks/lookup/:s": { symbol: "AAPL", name: "Apple" }, "POST /stocks/:id/trades": {} })
    const { user } = await renderApp(StocksPage)
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl")
    await user.type(screen.getByPlaceholderText("10"), "0")
    await user.type(screen.getByPlaceholderText("1500"), "100")
    await user.type(screen.getByLabelText("Date"), "2024-03-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    expect(await screen.findByText("quantity must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST", "/stocks/s1/trades")).toHaveLength(0)
  })

  test("stocks: a zero dividend is rejected", async () => {
    const api = mockApi({
      "GET /stocks": [portfolio({ id: "s1", type: "stocks" })],
      "GET /stocks/:id": stockDetail({ id: "s1", positions: [stockPosition()] }),
      "POST /stocks/:id/dividends": {},
    })
    const { user } = await renderApp(StocksPage)
    await user.click(await screen.findByRole("button", { name: "+ Record dividend" }))
    await user.selectOptions(screen.getByLabelText("Symbol"), "AAPL")
    await user.type(screen.getByPlaceholderText("25.00"), "0")
    await user.type(screen.getByLabelText("Payment date"), "2024-06-01")
    await user.click(screen.getByRole("button", { name: "Save dividend" }))
    expect(await screen.findByText("amount must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("metals: a lot with zero weight is rejected", async () => {
    const api = mockApi({ "GET /metals": [portfolio({ id: "m1", type: "metals" })], "GET /metals/:id": metalDetail({ id: "m1" }), "POST /metals/:id/lots": {} })
    const { user } = await renderApp(MetalsPage)
    await user.click(await screen.findByRole("button", { name: "+ Add lot" }))
    await user.type(screen.getByPlaceholderText("31.1"), "0")
    await user.type(screen.getByPlaceholderText("2000"), "100")
    await user.type(screen.getByLabelText("Purchase date"), "2024-05-01")
    await user.click(screen.getByRole("button", { name: "Add lot" }))
    expect(await screen.findByText("weightPerPiece must be greater than 0")).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("metals: selling zero pieces never reaches the API (the browser's own min=1 check stops it)", async () => {
    const api = mockApi({ "GET /metals": [portfolio({ id: "m1", type: "metals" })], "GET /metals/:id": metalDetail({ id: "m1", lots: [lot()] }), "POST /metals/:id/lots/:l/sales": {} })
    const { user } = await renderApp(MetalsPage)
    await user.click(await screen.findByRole("button", { name: "Sell" }))
    const qty = screen.getByLabelText(/Qty to sell/) as HTMLInputElement
    await user.clear(qty)
    await user.type(qty, "0")
    await user.type(screen.getByPlaceholderText("0.00"), "10")
    await user.type(screen.getByLabelText("Sale date"), "2024-06-01")
    await user.click(screen.getByRole("button", { name: "Record sale" }))
    expect(api.calls("POST")).toHaveLength(0)
    expect((screen.getByLabelText(/Qty to sell/) as HTMLInputElement).validity.valid).toBe(false)
  })
})
