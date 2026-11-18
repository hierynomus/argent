import { describe, expect, test } from "vitest"
import { mockApi } from "../../test/fakeApi"
import { cryptoDetail, portfolio, stockDetail, stockPosition } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import CryptoPage from "./Crypto.vue"
import StocksPage from "./Stocks.vue"

const T0 = Date.UTC(2024, 0, 1)
const hist = (symbol: string, currency: string) => ({ symbol, currency, range: "1y", points: [100, 120].map((v, i) => ({ t: T0 + i * 86_400_000, v })) })
const btc = { symbol: "BTC", name: "Bitcoin", assetForm: null, balance: 1, avgCostBasis: 30000, totalCost: 30000, realizedPnL: 0, currentPrice: 50000, currentValue: 50000, unrealizedPnL: 20000 }
const eth = { ...btc, symbol: "ETH", name: "Ether" }

describe("crypto: clicking a position opens its price chart", () => {
  const setup = async () => {
    const api = mockApi({
      "GET /crypto": [portfolio({ id: "p1" })],
      "GET /crypto/:id": cryptoDetail({
        id: "p1", positions: [btc, eth],
        trades: [{ id: "t1", portfolioId: "p1", tradeDate: "2024-01-01", fromSymbol: "EUR", fromAmount: "100", toSymbol: "BTC", toAmount: "1", baseCurrencyAmount: "100", notes: null, createdAt: "" }],
      }),
      "GET /crypto/history/:symbol": ({ params }: any) => hist(params.symbol, "EUR"),
    })
    return { api, ...(await renderApp(CryptoPage)) }
  }

  test("no chart until a symbol is clicked; the chart shows that asset with this portfolio's trades", async () => {
    const { api, user } = await setup()
    await screen.findByText("Bitcoin")
    expect(screen.queryByTestId("asset-chart")).not.toBeInTheDocument()
    expect(api.calls("GET", "/crypto/history/BTC")).toHaveLength(0)

    await user.click(screen.getByRole("button", { name: "BTC" }))
    expect(await screen.findByRole("img", { name: /Bitcoin price in EUR/ })).toBeInTheDocument()
    expect(api.calls("GET", "/crypto/history/BTC")[0].query).toMatchObject({ currency: "EUR", range: "1y" })
    expect(screen.getByRole("button", { name: "BTC" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getAllByTestId("trade-marker")).toHaveLength(1)
  })

  test("another symbol replaces the chart; clicking the open one (or Close) hides it", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "BTC" }))
    await screen.findByRole("img", { name: /Bitcoin/ })
    await user.click(screen.getByRole("button", { name: "ETH" }))
    expect(await screen.findByRole("img", { name: /Ether price/ })).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: /Bitcoin price/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "ETH" }))
    await waitFor(() => expect(screen.queryByTestId("asset-chart")).not.toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "BTC" }))
    await user.click(await screen.findByRole("button", { name: "Close chart" }))
    await waitFor(() => expect(screen.queryByTestId("asset-chart")).not.toBeInTheDocument())
  })
})

describe("stocks: clicking a position opens its price chart", () => {
  test("uses the stocks endpoint and the portfolio's currency", async () => {
    const api = mockApi({
      "GET /stocks": [portfolio({ id: "s1", type: "stocks", broker: "DEGIRO", currency: "USD" })],
      "GET /stocks/:id": stockDetail({ id: "s1", positions: [stockPosition()] }),
      "GET /stocks/history/:symbol": ({ params }: any) => hist(params.symbol, "USD"),
    })
    const { user } = await renderApp(StocksPage)
    await user.click(await screen.findByRole("button", { name: "AAPL" }))
    expect(await screen.findByRole("img", { name: /Apple Inc\. price in USD/ })).toBeInTheDocument()
    expect(api.calls("GET", "/stocks/history/AAPL")[0].query).toMatchObject({ currency: "USD" })
  })
})
