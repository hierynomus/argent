import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../../test/fakeApi"
import { renderApp, screen, waitFor } from "../../../test/render"
import AssetChart from "./AssetChart.vue"

const DAY = 86_400_000
const T0 = Date.UTC(2024, 0, 1)
const history = (prices: number[]) => ({ symbol: "BTC", currency: "EUR", range: "1y", points: prices.map((v, i) => ({ t: T0 + i * DAY, v })) })

const trade = (over: object) => ({ id: "t", portfolioId: "p1", tradeDate: "2024-01-02", fromSymbol: "EUR", fromAmount: "200", toSymbol: "BTC", toAmount: "2", baseCurrencyAmount: "200", notes: null, createdAt: "", ...over })

const mount = (props: Record<string, unknown> = {}, routes: Record<string, any> = {}) => {
  const api = mockApi({ "GET /crypto/history/:symbol": history([100, 110, 90, 120, 130]), ...routes })
  return renderApp(AssetChart, { props: { kind: "crypto", symbol: "BTC", name: "Bitcoin", currency: "EUR", trades: [], ...props } }).then((utils) => ({ api, ...utils }))
}

describe("AssetChart", () => {
  test("loads one year of EUR prices by default and shows the chart with the change over the period", async () => {
    const { api } = await mount()
    expect(await screen.findByRole("img", { name: /Bitcoin price in EUR, last year/ })).toBeInTheDocument()
    const call = api.calls("GET", "/crypto/history/BTC")[0]
    expect(call.query).toMatchObject({ range: "1y", currency: "EUR" })
    expect(screen.getByRole("heading", { name: /Bitcoin/ })).toHaveTextContent("BTC")
    // 100 → 130 is +30,00%
    expect(screen.getByText(/\+30,00%/)).toBeInTheDocument()
  })

  test("a loss is shown with a minus sign (not only in red)", async () => {
    await mount({}, { "GET /crypto/history/:symbol": history([200, 150]) })
    expect(await screen.findByText(/-25,00%/)).toBeInTheDocument()
  })

  test("choosing another range requests it, and the chart is renamed to match", async () => {
    const { api, user } = await mount()
    await screen.findByRole("img")
    await user.click(screen.getByRole("button", { name: "3M" }))
    await waitFor(() => expect(api.calls("GET", "/crypto/history/BTC").some((c) => c.query.range === "3m")).toBe(true))
    expect(await screen.findByRole("img", { name: /last 3 months/ })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Max" }))
    await waitFor(() => expect(api.calls("GET", "/crypto/history/BTC").some((c) => c.query.range === "max")).toBe(true))
  })

  test("stocks use the stocks endpoint and the portfolio currency", async () => {
    const api = mockApi({ "GET /stocks/history/:symbol": { symbol: "AAPL", currency: "USD", range: "1y", points: [{ t: T0, v: 100 }, { t: T0 + DAY, v: 101 }] } })
    await renderApp(AssetChart, { props: { kind: "stocks", symbol: "AAPL", name: "Apple", currency: "USD", trades: [] } })
    await screen.findByRole("img")
    expect(api.calls("GET", "/stocks/history/AAPL")[0].query).toMatchObject({ currency: "USD", range: "1y" })
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0)
  })

  test("buys and sells of the asset are marked at the price actually paid or received; swaps and other assets are not", async () => {
    await mount({
      trades: [
        trade({ id: "b", tradeDate: "2024-01-02", fromAmount: "200", toAmount: "2" }), // bought 2 BTC for 200: 100 each
        trade({ id: "s", tradeDate: "2024-01-04", fromSymbol: "BTC", fromAmount: "1", toSymbol: "EUR", toAmount: "125" }), // sold 1 for 125
        trade({ id: "w", fromSymbol: "BTC", fromAmount: "1", toSymbol: "ETH", toAmount: "10" }), // a swap: no price in EUR
        trade({ id: "o", toSymbol: "ETH", toAmount: "5" }), // another asset
        trade({ id: "old", tradeDate: "2020-01-01" }), // before the chart starts
      ],
    })
    await screen.findByRole("img")
    const markers = screen.getAllByTestId("trade-marker")
    expect(markers).toHaveLength(2)
    expect(markers[0]).toHaveTextContent(/bought 2 BTC at €100,00/)
    expect(markers[1]).toHaveTextContent(/sold 1 BTC at €125,00/)
    expect(screen.getByLabelText("Legend")).toHaveTextContent("Bought")
    expect(screen.getByLabelText("Legend")).toHaveTextContent("Sold")
  })

  test("no legend when there are no trades to mark", async () => {
    await mount()
    await screen.findByRole("img")
    expect(screen.queryByLabelText("Legend")).not.toBeInTheDocument()
  })

  test("tiny prices (SHIB) are readable on the axis", async () => {
    await mount({ symbol: "SHIB", name: "Shiba Inu" }, { "GET /crypto/history/:symbol": { symbol: "SHIB", currency: "EUR", range: "1y", points: [{ t: T0, v: 0.0000085 }, { t: T0 + DAY, v: 0.0000092 }] } })
    await screen.findByRole("img")
    expect([...document.querySelectorAll("svg text")].some((t) => /€0,00000[89]/.test(t.textContent ?? ""))).toBe(true)
  })

  test("the data can also be read as a table", async () => {
    await mount()
    await screen.findByRole("img")
    const table = screen.getByRole("table", { hidden: true })
    expect(table.querySelectorAll("tbody tr")).toHaveLength(5)
    expect(table).toHaveTextContent("€130,00")
    expect(screen.getByText("Show data as a table")).toBeInTheDocument()
  })

  test("says so when there is no history for the symbol", async () => {
    await mount({ symbol: "NOPE" }, { "GET /crypto/history/:symbol": { symbol: "NOPE", currency: "EUR", range: "1y", points: [] } })
    expect(await screen.findByText(/No price history is available for NOPE/)).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })

  test("shows the server's message when the request fails", async () => {
    await mount({}, { "GET /crypto/history/:symbol": respond(400, { error: "range must be one of 1m, 3m, 6m, 1y, max" }) })
    expect(await screen.findByText(/range must be one of/)).toBeInTheDocument()
  })

  test("a temporarily unavailable provider is explained, and Try again loads the chart", async () => {
    let calls = 0
    const { api, user } = await mount({}, {
      "GET /crypto/history/:symbol": () => (++calls <= 1 ? respond(503, { error: "Price history is temporarily unavailable (the price provider is rate limited). Try again in a minute." }) : history([100, 130])),
    })
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument()
    expect(screen.queryByText(/No price history is available/)).not.toBeInTheDocument() // not "unknown symbol"
    await user.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("img", { name: /price in EUR/ })).toBeInTheDocument()
    expect(api.calls("GET", "/crypto/history/BTC").length).toBeGreaterThanOrEqual(2)
  })

  test("Close tells the parent", async () => {
    const { user, emitted } = await mount() as any
    await screen.findByRole("img")
    await user.click(screen.getByRole("button", { name: "Close chart" }))
    expect(emitted().close).toHaveLength(1)
  })
})
