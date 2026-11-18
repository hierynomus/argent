import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { cryptoDetail, lot, metalDetail, portfolio, stockDetail, stockPosition } from "../../test/fixtures"
import { renderApp, screen, waitFor, within } from "../../test/render"
import CryptoPage from "./Crypto.vue"
import MetalsPage from "./Metals.vue"
import StocksPage from "./Stocks.vue"

const pos = (symbol: string, name: string, over: object = {}) => ({
  symbol, name, assetForm: null, balance: 1, avgCostBasis: 100, totalCost: 100, realizedPnL: 0, currentPrice: 150, currentValue: 150, unrealizedPnL: 50, ...over,
})
const buy = (id: string, portfolioId: string, symbol: string, date: string) => ({ id, portfolioId, tradeDate: date, fromSymbol: "EUR", fromAmount: "100", toSymbol: symbol, toAmount: "1", baseCurrencyAmount: "100", notes: null, createdAt: "" })
const T0 = Date.UTC(2024, 0, 1)

describe("crypto overview", () => {
  const setup = async (extra: Record<string, any> = {}) => {
    const api = mockApi({
      "GET /crypto": [portfolio({ id: "p1", name: "Main" }), portfolio({ id: "p2", name: "Second" })],
      "GET /crypto/:id": ({ params }: any) =>
        params.id === "p1"
          ? cryptoDetail({ id: "p1", name: "Main", positions: [pos("BTC", "Bitcoin", { balance: 1, totalCost: 30000, currentValue: 50000, currentPrice: 50000 }), pos("ETH", "Ether", { totalCost: 1000, currentValue: 2000, currentPrice: 2000 })], trades: [buy("t1", "p1", "BTC", "2024-01-02")] })
          : cryptoDetail({ id: "p2", name: "Second", positions: [pos("BTC", "Bitcoin", { balance: 0.5, totalCost: 20000, currentValue: 25000, currentPrice: 50000 })], trades: [buy("t2", "p2", "BTC", "2024-01-03")] }),
      "GET /crypto/history/:symbol": { symbol: "BTC", currency: "EUR", range: "1y", points: [100, 120, 110, 130].map((v, i) => ({ t: T0 + i * 86_400_000, v })) },
      ...extra,
    })
    return { api, ...(await renderApp(CryptoPage)) }
  }

  test("the Overview tab is first and shows each asset once, summed over the portfolios that hold it", async () => {
    await setup()
    const rows = await screen.findAllByRole("row")
    await screen.findByText("Bitcoin")
    const btc = screen.getByRole("button", { name: "BTC" }).closest("tr")!
    expect(within(btc).getByText("in Main, Second")).toBeInTheDocument()
    expect(btc).toHaveTextContent("1,5") // 1 + 0.5 BTC
    expect(btc).toHaveTextContent("€75.000,00") // 50.000 + 25.000
    expect(screen.getAllByRole("button", { name: /^(BTC|ETH)$/ })).toHaveLength(2)
    expect(rows.length).toBeGreaterThan(2)
  })

  test("the totals cover every portfolio", async () => {
    await setup()
    await screen.findByText("Bitcoin")
    expect(screen.getByText("€51.000,00", { selector: "p" })).toBeInTheDocument() // open cost 30000 + 1000 + 20000
    expect(screen.getByText("€77.000,00", { selector: "p" })).toBeInTheDocument() // value 50000 + 2000 + 25000
    expect(screen.getByText("+€26.000,00", { selector: "p" })).toBeInTheDocument() // unrealized
    expect(screen.getByText(/2 portfolios: Main, Second/)).toBeInTheDocument()
  })

  test("clicking an asset shows its chart with the buys from every portfolio", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "BTC" }))
    expect(await screen.findByRole("img", { name: /Bitcoin price in EUR/ })).toBeInTheDocument()
    expect(api.calls("GET", "/crypto/history/BTC")[0].query).toMatchObject({ currency: "EUR" })
    expect(screen.getAllByTestId("trade-marker")).toHaveLength(2) // one buy in each portfolio
  })

  test("a single portfolio has no Overview tab; a second one adds it", async () => {
    mockApi({ "GET /crypto": [portfolio({ id: "p1", name: "Main" })], "GET /crypto/:id": cryptoDetail({ id: "p1", name: "Main" }) })
    await renderApp(CryptoPage)
    await screen.findByText("Open cost")
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument()
  })

  test("USD and EUR portfolios are shown as separate sections, never summed", async () => {
    mockApi({
      "GET /crypto": [portfolio({ id: "e", name: "Euro", currency: "EUR" }), portfolio({ id: "u", name: "Dollar", currency: "USD" })],
      "GET /crypto/:id": ({ params }: any) =>
        params.id === "e"
          ? cryptoDetail({ id: "e", name: "Euro", currency: "EUR", positions: [pos("BTC", "Bitcoin", { totalCost: 100, currentValue: 150 })] })
          : cryptoDetail({ id: "u", name: "Dollar", currency: "USD", positions: [pos("BTC", "Bitcoin", { totalCost: 1000, currentValue: 1500 })] }),
    })
    await renderApp(CryptoPage)
    const eur = await screen.findByRole("region", { name: "EUR portfolios" })
    const usd = screen.getByRole("region", { name: "USD portfolios" })
    expect(within(eur).getByText("€150,00", { selector: "p" })).toBeInTheDocument()
    expect(within(usd).getByText("$1.500,00", { selector: "p" })).toBeInTheDocument()
    expect(screen.queryByText("$1.650,00")).not.toBeInTheDocument()
  })

  test("while a portfolio still loads, the others are already summed (and a missing price shows as unknown)", async () => {
    await setup()
    await screen.findByText("Bitcoin")
    expect(screen.queryByText("Loading portfolios…")).not.toBeInTheDocument()
  })

  test("returning to the Overview from a portfolio works, and creating a portfolio opens the new one", async () => {
    const { user } = await setup({ "POST /crypto": ({ body }: any) => (portfolio({ id: "p3", name: body.name })) })
    await screen.findByText("Bitcoin")
    await user.click(screen.getByRole("button", { name: /Second/ }))
    await waitFor(() => expect(screen.queryByText(/2 portfolios: Main, Second/)).not.toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Overview" }))
    expect(await screen.findByText(/2 portfolios: Main, Second/)).toBeInTheDocument()
  })
})

describe("stocks overview", () => {
  test("sums shares and dividends per asset across portfolios", async () => {
    mockApi({
      "GET /stocks": [portfolio({ id: "s1", name: "DEGIRO", type: "stocks", broker: "DEGIRO", currency: "EUR" }), portfolio({ id: "s2", name: "Saxo", type: "stocks", broker: "Saxo", currency: "EUR" })],
      "GET /stocks/:id": ({ params }: any) =>
        stockDetail({ id: params.id, name: params.id === "s1" ? "DEGIRO" : "Saxo", currency: "EUR", positions: [stockPosition({ symbol: "AAPL", balance: params.id === "s1" ? 10 : 5, totalCost: 800, currentValue: 1000, totalDividends: params.id === "s1" ? 20 : 5 })] }),
    })
    await renderApp(StocksPage)
    const row = (await screen.findByRole("button", { name: "AAPL" })).closest("tr")!
    expect(row).toHaveTextContent("15") // 10 + 5 shares
    expect(row).toHaveTextContent("€25,00") // 20 + 5 dividends
    expect(screen.getByText("€25,00", { selector: "p" })).toBeInTheDocument() // dividends tile
  })
})

describe("metals overview", () => {
  test("sums the remaining pieces and weight of each metal across portfolios", async () => {
    const l = (id: string, over: object = {}) => lot({ id, metal: "gold", remainingQuantity: 1, quantity: 1, weightPerPiece: "31.1", unit: "g", pricePerPiece: "1000", currentValuePerPiece: 1200, unrealizedPnL: 200, realizedPnL: 0, ...over } as any)
    mockApi({
      "GET /metals": [portfolio({ id: "m1", name: "Safe", type: "metals" }), portfolio({ id: "m2", name: "Bank", type: "metals" })],
      "GET /metals/:id": ({ params }: any) =>
        metalDetail({ id: params.id, name: params.id === "m1" ? "Safe" : "Bank", lots: [l(`l-${params.id}`, { remainingQuantity: params.id === "m1" ? 2 : 1 })], totalInvestedOpen: params.id === "m1" ? 2000 : 1000, totalCurrentValueOpen: params.id === "m1" ? 2400 : 1200, totalUnrealizedPnL: 0, totalRealizedPnL: 0 }),
    })
    await renderApp(MetalsPage)
    const row = (await screen.findByText("Gold")).closest("tr")!
    expect(row).toHaveTextContent("93,3") // 3 pieces × 31.1 g
    expect(row).toHaveTextContent("€3.600,00") // value
    expect(screen.getByText("€3.000,00", { selector: "p" })).toBeInTheDocument() // open cost tile
    expect(screen.getByText(/2 portfolios: Safe, Bank/)).toBeInTheDocument()
  })
})
