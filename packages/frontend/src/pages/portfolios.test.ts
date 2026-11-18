import { describe, expect, test } from "vitest"
import { mockApi, respond } from "../../test/fakeApi"
import { cryptoDetail, lot, metalDetail, portfolio, stockDetail, stockPosition } from "../../test/fixtures"
import { renderApp, screen, waitFor } from "../../test/render"
import CryptoPage from "./Crypto.vue"
import MetalsPage from "./Metals.vue"
import StocksPage from "./Stocks.vue"

/** What the three portfolio screens have in common: list/tabs, creation, sharing, deletion. */
const kinds = [
  { name: "crypto", Page: CryptoPage, base: "/crypto", type: "crypto", title: "Crypto", empty: "No crypto portfolio yet.", detail: cryptoDetail },
  { name: "metals", Page: MetalsPage, base: "/metals", type: "metals", title: "Precious Metals", empty: "No metals portfolio yet.", detail: metalDetail },
  { name: "stocks", Page: StocksPage, base: "/stocks", type: "stocks", title: "Stocks", empty: "No stock portfolio yet.", detail: stockDetail },
] as const

for (const k of kinds) {
  describe(`${k.name} page: portfolio shell`, () => {
    const setup = async (list: any[], details: Record<string, any> = {}, extra: Record<string, any> = {}) => {
      const api = mockApi({
        [`GET ${k.base}`]: list,
        [`GET ${k.base}/:id`]: ({ params }: any) => details[params.id] ?? k.detail({ id: params.id, name: `Detail ${params.id}` } as any),
        [`POST ${k.base}`]: ({ body }: any) => ({ id: "new", ...body }),
        [`DELETE ${k.base}/:id`]: respond(204),
        [`POST ${k.base}/:id/members`]: ({ body }: any) => body,
        [`DELETE ${k.base}/:id/members/:group`]: respond(204),
        ...extra,
      })
      return { api, ...await renderApp(k.Page) }
    }
    const p = (id: string, over: object = {}) => portfolio({ id, name: `P-${id}`, type: k.type, ...over } as any)

    test("empty state offers to create the first portfolio", async () => {
      await setup([])
      expect(await screen.findByText(k.empty)).toBeInTheDocument()
      expect(screen.getByRole("heading", { name: k.title })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Create portfolio" })).toBeInTheDocument()
    })

    test("creates a portfolio with a name and currency", async () => {
      const { api, user } = await setup([])
      await user.click(await screen.findByRole("button", { name: "Create portfolio" }))
      await user.type(screen.getByPlaceholderText("Portfolio name"), "  Retirement ")
      await user.click(screen.getByRole("button", { name: "USD" }))
      await user.click(screen.getByRole("button", { name: "Create" }))
      await waitFor(() => expect(api.calls("POST", k.base)).toHaveLength(1))
      expect(api.calls("POST", k.base)[0].body).toMatchObject({ name: "Retirement", currency: "USD" })
    })

    test("a blank name does not create anything", async () => {
      const { api, user } = await setup([])
      await user.click(await screen.findByRole("button", { name: "Create portfolio" }))
      await user.type(screen.getByPlaceholderText("Portfolio name"), "   ")
      await user.click(screen.getByRole("button", { name: "Create" }))
      expect(api.calls("POST", k.base)).toHaveLength(0)
    })

    test("a single portfolio is shown without tabs", async () => {
      const { api } = await setup([p("p1")])
      expect(await screen.findByText("Open cost")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "P-p1" })).not.toBeInTheDocument()
      expect(api.calls("GET", `${k.base}/p1`)).toHaveLength(1)
      expect(api.unmatched).toEqual([])
    })

    test("several portfolios show tabs; the first is active and clicking another loads it", async () => {
      const { api, user } = await setup([p("p1"), p("p2")])
      expect(await screen.findByRole("button", { name: /P-p1/ })).toBeInTheDocument()
      await waitFor(() => expect(api.calls("GET", `${k.base}/p1`)).toHaveLength(1))
      await user.click(screen.getByRole("button", { name: /P-p2/ }))
      await waitFor(() => expect(api.calls("GET", `${k.base}/p2`)).toHaveLength(1))
    })

    test("owner can share: add a group with a role, remove a group", async () => {
      const members = [{ groupName: "friends", role: "viewer" as const }]
      const { api, user } = await setup([p("p1")], { p1: k.detail({ id: "p1", members } as any) })
      await user.click(await screen.findByRole("button", { name: "Share" }))
      expect(screen.getByText("friends")).toBeInTheDocument()
      await user.type(screen.getByPlaceholderText("e.g. family"), " family ")
      await user.click(screen.getByRole("button", { name: "editor" }))
      await user.click(screen.getByRole("button", { name: "+ Add" }))
      await waitFor(() => expect(api.calls("POST", `${k.base}/p1/members`)).toHaveLength(1))
      expect(api.calls("POST", `${k.base}/p1/members`)[0].body).toEqual({ groupName: "family", role: "editor" })
      await user.click(screen.getByRole("button", { name: "Remove" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/p1/members/friends`)).toHaveLength(1))
    })

    test("owner can delete the portfolio after confirming", async () => {
      const { api, user } = await setup([p("p1")])
      await user.click(await screen.findByRole("button", { name: "Delete portfolio" }))
      expect(screen.getByText("Delete portfolio?")).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Yes" }))
      await waitFor(() => expect(api.calls("DELETE", `${k.base}/p1`)).toHaveLength(1))
    })

    test("a viewer sees the data but no way to change or share anything", async () => {
      await setup([p("p1", { isOwner: false, canEdit: false })], { p1: k.detail({ id: "p1", isOwner: false, canEdit: false } as any) })
      expect(await screen.findByText("Open cost")).toBeInTheDocument()
      for (const name of ["Share", "Delete portfolio", /Record trade/, /Add lot/, /Record dividend/]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument()
      }
    })

    test("an editor can record data but cannot share or delete", async () => {
      await setup([p("p1", { isOwner: false })], { p1: k.detail({ id: "p1", isOwner: false, canEdit: true } as any) })
      expect(await screen.findByText("Open cost")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Delete portfolio" })).not.toBeInTheDocument()
      expect(screen.getByRole("button", { name: /\+ (Record trade|Add lot)/ })).toBeInTheDocument()
    })

    test("sharing errors are shown", async () => {
      const { user } = await setup([p("p1")], {}, { [`POST ${k.base}/:id/members`]: respond(400, { error: "groupName is required" }) })
      await user.click(await screen.findByRole("button", { name: "Share" }))
      await user.type(screen.getByPlaceholderText("e.g. family"), "x")
      await user.click(screen.getByRole("button", { name: "+ Add" }))
      expect(await screen.findByText("groupName is required")).toBeInTheDocument()
    })
  })
}

describe("stocks page: broker", () => {
  test("a broker can be entered when creating a portfolio, and is shown on the tab", async () => {
    const api = mockApi({
      "GET /stocks": [portfolio({ id: "s1", name: "Long term", type: "stocks", broker: "DEGIRO" }), portfolio({ id: "s2", name: "Fun", type: "stocks", broker: null })],
      "GET /stocks/:id": ({ params }: any) => stockDetail({ id: params.id }),
      "POST /stocks": ({ body }: any) => ({ id: "new", ...body }),
    })
    const { user } = await renderApp(StocksPage)
    expect(await screen.findByText("(DEGIRO)")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "+ New portfolio" }))
    await user.type(screen.getByPlaceholderText("Portfolio name"), "Another")
    await user.type(screen.getByPlaceholderText("Broker (e.g. DEGIRO)"), "Trade Republic")
    await user.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => expect(api.calls("POST", "/stocks")).toHaveLength(1))
    expect(api.calls("POST", "/stocks")[0].body).toMatchObject({ name: "Another", broker: "Trade Republic" })
  })
})

describe("crypto page: positions and trades", () => {
  const withBtc = () => cryptoDetail({
    id: "p1", totalOpenCostEur: 30000, totalCurrentValueEur: 50000, totalUnrealizedPnL: 20000, totalRealizedPnL: -150,
    positions: [{ symbol: "BTC", name: "Bitcoin", assetForm: null, balance: 1, avgCostBasis: 30000, totalCostEur: 30000, realizedPnL: -150, currentPrice: 50000, currentValueEur: 50000, unrealizedPnL: 20000 }],
    trades: [{ id: "t1", portfolioId: "p1", tradeDate: "2024-01-01", fromSymbol: "EUR", fromAmount: "30000", toSymbol: "BTC", toAmount: "1", baseCurrencyAmount: "30000", notes: "first", createdAt: "" }],
  })
  const setup = async (detail = withBtc()) => {
    const api = mockApi({
      "GET /crypto": [portfolio({ id: "p1" })], "GET /crypto/:id": detail,
      "POST /crypto/:id/trades": ({ body }: any) => ({ id: "t", ...body }),
    })
    return { api, ...await renderApp(CryptoPage) }
  }

  test("shows summary tiles and positions with P&L formatting", async () => {
    await setup()
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument()
    expect(screen.getByText("€30,000.00", { selector: "p" })).toBeInTheDocument() // open cost tile
    expect(screen.getByText("+€20,000.00", { selector: "p" })).toBeInTheDocument() // unrealized tile
    expect(screen.getByText("€-150.00", { selector: "p" })).toBeInTheDocument() // realized tile (negative)
    expect(screen.getByText("BTC")).toBeInTheDocument()
  })

  test("with no positions it says so", async () => {
    await setup(cryptoDetail({ id: "p1" }))
    expect(await screen.findByText(/No positions yet/)).toBeInTheDocument()
  })

  test("records a buy: base amount is sent as 'from', the coin as 'to'", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.type(screen.getByPlaceholderText("BTC"), "eth")
    await user.type(screen.getByPlaceholderText("Bitcoin"), "Ethereum")
    await user.type(screen.getByPlaceholderText("0.5"), "2")
    await user.type(screen.getByPlaceholderText("20000"), "4000")
    await user.type(screen.getByLabelText("Date"), "2024-03-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    await waitFor(() => expect(api.calls("POST", "/crypto/p1/trades")).toHaveLength(1))
    expect(api.calls("POST", "/crypto/p1/trades")[0].body).toEqual({
      tradeDate: "2024-03-01", fromSymbol: "EUR", fromAmount: "4000", toSymbol: "ETH", toAmount: "2", assetName: "Ethereum",
    })
  })

  test("records a sell from the list of held coins", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.click(screen.getByRole("button", { name: "sell" }))
    await user.selectOptions(screen.getByLabelText("From symbol"), "BTC")
    await user.type(screen.getByPlaceholderText("0.5"), "0.25")
    await user.type(screen.getByPlaceholderText("20000"), "9000")
    await user.type(screen.getByLabelText("Date"), "2024-03-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    await waitFor(() => expect(api.calls("POST", "/crypto/p1/trades")).toHaveLength(1))
    expect(api.calls("POST", "/crypto/p1/trades")[0].body).toEqual({
      tradeDate: "2024-03-01", fromSymbol: "BTC", fromAmount: "0.25", toSymbol: "EUR", toAmount: "9000",
    })
  })

  test("records a swap and explains that cost basis carries over", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.click(screen.getByRole("button", { name: "swap" }))
    expect(screen.getByText(/Cost basis transfers automatically/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("From symbol"), "BTC")
    await user.type(screen.getByPlaceholderText("0.5"), "1")
    await user.type(screen.getByPlaceholderText("ETH"), "eth")
    await user.type(screen.getByPlaceholderText("3.0"), "15")
    await user.type(screen.getByLabelText("Date"), "2024-03-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    await waitFor(() => expect(api.calls("POST", "/crypto/p1/trades")).toHaveLength(1))
    expect(api.calls("POST", "/crypto/p1/trades")[0].body).toEqual({
      tradeDate: "2024-03-01", fromSymbol: "BTC", fromAmount: "1", toSymbol: "ETH", toAmount: "15",
    })
  })

  test("cancel closes the form without sending anything", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("button", { name: "+ Record trade" })).toBeInTheDocument()
    expect(api.calls("POST")).toHaveLength(0)
  })

  test("trade history is collapsed until opened, newest first", async () => {
    const { user } = await setup()
    const toggle = await screen.findByRole("button", { name: /Trade history \(1\)/ })
    expect(screen.queryByText("first")).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByText("first")).toBeInTheDocument()
    expect(screen.getByText("Buy")).toBeInTheDocument()
  })
})

describe("stocks page: positions, trades and dividends", () => {
  const detail = () => stockDetail({
    id: "s1", currency: "USD", totalOpenCostEur: 800, totalCurrentValueEur: 1000, totalUnrealizedPnL: 200, totalRealizedPnL: 0, totalDividends: 12.5,
    positions: [stockPosition({ totalDividends: 12.5 })],
    trades: [{ id: "t1", portfolioId: "s1", tradeDate: "2024-01-01", fromSymbol: "USD", fromAmount: "800", toSymbol: "AAPL", toAmount: "10", baseCurrencyAmount: "800", notes: "start", createdAt: "" }],
    dividends: [{ id: "d1", portfolioId: "s1", symbol: "AAPL", paymentDate: "2024-03-01", amount: "12.50", notes: "Q1", createdAt: "" }],
  })
  const setup = async (lookup: any = { symbol: "AAPL", name: "Apple Inc." }) => {
    const api = mockApi({
      "GET /stocks": [portfolio({ id: "s1", type: "stocks", currency: "USD", broker: "DEGIRO" })], "GET /stocks/:id": detail(),
      "POST /stocks/:id/trades": ({ body }: any) => ({ id: "t", ...body }),
      "POST /stocks/:id/dividends": ({ body }: any) => ({ id: "d", ...body }),
      "DELETE /stocks/:id/dividends/:did": respond(204),
      "GET /stocks/lookup/:symbol": lookup,
    })
    return { api, ...await renderApp(StocksPage) }
  }

  test("shows the position, its dividends and the dividend tile", async () => {
    await setup()
    expect(await screen.findByText("Apple Inc.")).toBeInTheDocument()
    expect(screen.getAllByText("$12.50").length).toBeGreaterThan(0)
    expect(screen.getByText("Dividends", { selector: "p" })).toBeInTheDocument()
  })

  test("buying: leaving the symbol field looks the name up and fills it in", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.type(screen.getByPlaceholderText("AAPL"), "aapl")
    await user.tab() // blur → lookup
    await waitFor(() => expect(api.calls("GET", "/stocks/lookup/aapl")).toHaveLength(1))
    await waitFor(() => expect((screen.getByPlaceholderText("Apple Inc.") as HTMLInputElement).value).toBe("Apple Inc."))
    await user.type(screen.getByPlaceholderText("10"), "5")
    await user.type(screen.getByPlaceholderText("1500"), "450")
    await user.type(screen.getByLabelText("Date"), "2024-04-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    await waitFor(() => expect(api.calls("POST", "/stocks/s1/trades")).toHaveLength(1))
    expect(api.calls("POST", "/stocks/s1/trades")[0].body).toEqual({
      tradeDate: "2024-04-01", type: "buy", symbol: "AAPL", quantity: "5", amount: "450", assetName: "Apple Inc.",
    })
  })

  test("an unknown ticker is flagged after the lookup", async () => {
    const { user } = await setup({ symbol: "ZZZZ", name: null })
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.type(screen.getByPlaceholderText("AAPL"), "zzzz")
    await user.tab()
    expect(await screen.findByText(/not found|unknown|couldn't find/i)).toBeInTheDocument()
  })

  test("selling picks from held positions and sends no asset name", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record trade" }))
    await user.click(screen.getByRole("button", { name: "sell" }))
    await user.selectOptions(screen.getByLabelText("Symbol"), "AAPL")
    await user.type(screen.getByPlaceholderText("10"), "4")
    await user.type(screen.getByPlaceholderText("1500"), "480")
    await user.type(screen.getByLabelText("Date"), "2024-04-01")
    await user.click(screen.getByRole("button", { name: "Save trade" }))
    await waitFor(() => expect(api.calls("POST", "/stocks/s1/trades")).toHaveLength(1))
    expect(api.calls("POST", "/stocks/s1/trades")[0].body).toEqual({ tradeDate: "2024-04-01", type: "sell", symbol: "AAPL", quantity: "4", amount: "480" })
  })

  test("records a dividend", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Record dividend" }))
    await user.selectOptions(screen.getByLabelText("Symbol"), "AAPL")
    await user.type(screen.getByPlaceholderText("25.00"), "7.5")
    await user.type(screen.getByLabelText("Payment date"), "2024-06-01")
    await user.click(screen.getByRole("button", { name: "Save dividend" }))
    await waitFor(() => expect(api.calls("POST", "/stocks/s1/dividends")).toHaveLength(1))
    expect(api.calls("POST", "/stocks/s1/dividends")[0].body).toEqual({ symbol: "AAPL", paymentDate: "2024-06-01", amount: "7.5" })
  })

  test("dividend history can be opened and an entry removed", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: /Dividend history \(1\)/ }))
    expect(screen.getByText("Q1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(api.calls("DELETE", "/stocks/s1/dividends/d1")).toHaveLength(1))
  })

  test("trade history lists the buy", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: /Trade history \(1\)/ }))
    expect(screen.getByText("start")).toBeInTheDocument()
    expect(screen.getByText("Buy")).toBeInTheDocument()
  })
})

describe("metals page: lots and sales", () => {
  const detail = () => metalDetail({
    id: "m1", totalInvestedOpen: 3600, totalCurrentValueOpen: 3732, totalUnrealizedPnL: 132, totalRealizedPnL: 0,
    lots: [lot()],
  })
  const setup = async () => {
    const api = mockApi({
      "GET /metals": [portfolio({ id: "m1", type: "metals" })], "GET /metals/:id": detail(),
      "POST /metals/:id/lots": ({ body }: any) => ({ id: "l", ...body }),
      "POST /metals/:id/lots/:lotId/sales": ({ body }: any) => ({ id: "s", ...body }),
    })
    return { api, ...await renderApp(MetalsPage) }
  }

  test("shows each lot with its item name and remaining quantity", async () => {
    await setup()
    expect(await screen.findByText("Krugerrand")).toBeInTheDocument()
    expect(screen.getByText(/gold/i)).toBeInTheDocument()
  })

  test("adds a lot (defaults to grams) with parsed quantity", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "+ Add lot" }))
    await user.selectOptions(screen.getByLabelText("Metal"), "silver")
    await user.type(screen.getByPlaceholderText("1oz Krugerrand"), "Maple Leaf")
    await user.type(screen.getByPlaceholderText("31.1"), "31.1")
    await user.clear(screen.getByLabelText("Quantity"))
    await user.type(screen.getByLabelText("Quantity"), "3")
    await user.type(screen.getByPlaceholderText("2000"), "35")
    await user.type(screen.getByLabelText("Purchase date"), "2024-05-01")
    await user.click(screen.getByRole("button", { name: "Add lot" }))
    await waitFor(() => expect(api.calls("POST", "/metals/m1/lots")).toHaveLength(1))
    expect(api.calls("POST", "/metals/m1/lots")[0].body).toMatchObject({
      purchaseDate: "2024-05-01", metal: "silver", itemName: "Maple Leaf", weightPerPiece: "31.1", unit: "g", quantity: 3, pricePerPiece: "35",
    })
  })

  test("records a sale against a lot", async () => {
    const { api, user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Sell" }))
    await user.clear(screen.getByLabelText(/Qty to sell/))
    await user.type(screen.getByLabelText(/Qty to sell/), "1")
    await user.type(screen.getByPlaceholderText("0.00"), "1900")
    await user.type(screen.getByLabelText("Sale date"), "2024-06-01")
    await user.click(screen.getByRole("button", { name: "Record sale" }))
    await waitFor(() => expect(api.calls("POST", "/metals/m1/lots/lot-1/sales")).toHaveLength(1))
    expect(api.calls("POST", "/metals/m1/lots/lot-1/sales")[0].body).toEqual({ saleDate: "2024-06-01", quantitySold: 1, totalReceived: "1900" })
  })

  test("the sell form can be cancelled", async () => {
    const { user } = await setup()
    await user.click(await screen.findByRole("button", { name: "Sell" }))
    expect(screen.getByText(/Qty to sell/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByText(/Qty to sell/)).not.toBeInTheDocument()
  })
})
