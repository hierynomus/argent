import { describe, expect, test } from "bun:test"
import { del, get, patch, post, unique } from "../../test/helpers"
import { fakeFetch } from "../../test/fakeFetch"

const NIL = "00000000-0000-0000-0000-000000000000"

/** Behaviour shared by all three portfolio types. */
for (const kind of ["crypto", "metals", "stocks"] as const) {
  describe(`${kind} portfolios: CRUD & sharing`, () => {
    const base = `/${kind}`
    const create = (body: object = {}) => post(base, { name: unique(kind), ...body })

    test("create defaults to EUR, trims the name, and is listed with access flags", async () => {
      const r = await create({ name: `  ${unique("p")}  ` })
      expect(r.status).toBe(201)
      expect(r.body.currency).toBe("EUR")
      expect(r.body.name).toBe(r.body.name.trim())
      expect(r.body.type).toBe(kind)

      const list = await get(base)
      const found = list.body.find((p: any) => p.id === r.body.id)
      expect(found).toMatchObject({ isOwner: true, canEdit: true, members: [] })
    })

    test("rejects invalid input", async () => {
      expect((await post(base, { name: "  " })).status).toBe(400)
      expect((await post(base, {})).status).toBe(400)
      const cur = await create({ currency: "GBP" })
      expect(cur.status).toBe(400)
      expect(cur.body.error).toContain("currency must be EUR or USD")
    })

    test("PATCH renames, changes currency; empty body is rejected", async () => {
      const p = (await create()).body
      const r = await patch(`${base}/${p.id}`, { name: "Renamed", currency: "USD" })
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ name: "Renamed", currency: "USD" })
      expect((await patch(`${base}/${p.id}`, {})).status).toBe(400)
      expect((await patch(`${base}/${p.id}`, { currency: "JPY" })).status).toBe(400)
      expect((await patch(`${base}/${p.id}`, { name: "  " })).status).toBe(400)
    })

    test("GET /:id returns the portfolio; unknown id is 404", async () => {
      const p = (await create()).body
      const r = await get(`${base}/${p.id}`)
      expect(r.status).toBe(200)
      expect(r.body.id).toBe(p.id)
      expect(r.body).toMatchObject({ isOwner: true, canEdit: true })
      expect((await get(`${base}/${NIL}`)).status).toBe(404)
    })

    test("members: add (default viewer), upsert role, remove", async () => {
      const p = (await create()).body
      const added = await post(`${base}/${p.id}/members`, { groupName: " family " })
      expect(added.status).toBe(201)
      expect(added.body).toEqual({ groupName: "family", role: "viewer" })

      expect((await post(`${base}/${p.id}/members`, { groupName: "family", role: "editor" })).body.role).toBe("editor")
      let detail = (await get(`${base}/${p.id}`)).body
      expect(detail.members).toEqual([{ groupName: "family", role: "editor" }])

      expect((await del(`${base}/${p.id}/members/family`)).status).toBe(204)
      detail = (await get(`${base}/${p.id}`)).body
      expect(detail.members).toEqual([])
    })

    test("members: validation", async () => {
      const p = (await create()).body
      expect((await post(`${base}/${p.id}/members`, { groupName: "  " })).status).toBe(400)
      expect((await post(`${base}/${p.id}/members`, { groupName: "g", role: "owner" })).status).toBe(400)
      expect((await post(`${base}/${NIL}/members`, { groupName: "g" })).status).toBe(404)
    })

    test("DELETE removes the portfolio", async () => {
      const p = (await create()).body
      expect((await del(`${base}/${p.id}`)).status).toBe(204)
      expect((await get(`${base}/${p.id}`)).status).toBe(404)
      expect((await del(`${base}/${p.id}`)).status).toBe(404)
    })

    test("portfolios of another type are not reachable through this route", async () => {
      const other = kind === "crypto" ? "stocks" : "crypto"
      const p = (await post(`/${other}`, { name: unique("o") })).body
      expect((await get(`${base}/${p.id}`)).status).toBe(404)
      expect((await patch(`${base}/${p.id}`, { name: "x" })).status).toBe(403)
    })
  })
}

describe("stocks: broker", () => {
  test("broker is stored on create and update, and blank clears it", async () => {
    const p = (await post("/stocks", { name: unique("s"), broker: "  DEGIRO " })).body
    expect(p.broker).toBe("DEGIRO")
    expect((await patch(`/stocks/${p.id}`, { broker: "Trade Republic" })).body.broker).toBe("Trade Republic")
    expect((await patch(`/stocks/${p.id}`, { broker: "" })).body.broker).toBeNull()
    expect((await post("/stocks", { name: unique("s") })).body.broker).toBeNull()
  })

  test("lookup returns the name from the quote provider", async () => {
    expect((await get("/stocks/lookup/aapl")).body).toEqual({ symbol: "AAPL", name: "Apple Inc." })
    expect((await get("/stocks/lookup/zzzz")).body).toEqual({ symbol: "ZZZZ", name: null })
  })
})

describe("crypto trades", () => {
  const newPortfolio = async (currency: "EUR" | "USD" = "EUR") => (await post("/crypto", { name: unique("c"), currency })).body.id as string
  const trade = (id: string, body: object) => post(`/crypto/${id}/trades`, { tradeDate: "2024-01-01", ...body })

  test("buy: position, cost basis and live valuation", async () => {
    const id = await newPortfolio()
    const r = await trade(id, { fromSymbol: "eur", fromAmount: "30000", toSymbol: "btc", toAmount: "1", assetName: "Bitcoin" })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ fromSymbol: "EUR", toSymbol: "BTC", baseCurrencyAmount: "30000.00" })

    const d = (await get(`/crypto/${id}`)).body
    expect(d.positions).toHaveLength(1)
    expect(d.positions[0]).toMatchObject({
      symbol: "BTC", name: "Bitcoin", balance: 1, avgCostBasis: 30000, totalCostEur: 30000,
      currentPrice: 50000, currentValueEur: 50000, unrealizedPnL: 20000, realizedPnL: 0,
    })
    expect(d).toMatchObject({ totalOpenCostEur: 30000, totalCurrentValueEur: 50000, totalUnrealizedPnL: 20000, totalRealizedPnL: 0 })
  })

  test("prices follow the portfolio currency", async () => {
    const id = await newPortfolio("USD")
    await trade(id, { fromSymbol: "USD", fromAmount: "40000", toSymbol: "BTC", toAmount: "1" })
    const d = (await get(`/crypto/${id}`)).body
    expect(d.positions[0]).toMatchObject({ currentPrice: 55000, unrealizedPnL: 15000 })
  })

  test("sell realizes FIFO P&L and reduces the position", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "10000", toSymbol: "BTC", toAmount: "1", tradeDate: "2024-01-01" })
    await trade(id, { fromSymbol: "EUR", fromAmount: "30000", toSymbol: "BTC", toAmount: "1", tradeDate: "2024-02-01" })
    const sell = await trade(id, { fromSymbol: "BTC", fromAmount: "1", toSymbol: "EUR", toAmount: "25000", tradeDate: "2024-03-01" })
    expect(parseFloat(sell.body.baseCurrencyAmount)).toBe(25000) // proceeds are stored as the base amount
    const p = (await get(`/crypto/${id}`)).body.positions[0]
    expect(p).toMatchObject({ balance: 1, avgCostBasis: 30000, realizedPnL: 15000 })
  })

  test("overselling is rejected with the available balance", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "1000", toSymbol: "BTC", toAmount: "0.5" })
    const r = await trade(id, { fromSymbol: "BTC", fromAmount: "0.6", toSymbol: "EUR", toAmount: "2000" })
    expect(r.status).toBe(400)
    expect(r.body.error).toContain("Insufficient balance")
    expect((await trade(id, { fromSymbol: "ETH", fromAmount: "1", toSymbol: "EUR", toAmount: "2000" })).status).toBe(400)
  })

  test("swap transfers the FIFO cost basis (no realized P&L) and auto-computes baseCurrencyAmount", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "10000", toSymbol: "BTC", toAmount: "1" })
    const swap = await trade(id, { fromSymbol: "BTC", fromAmount: "1", toSymbol: "ETH", toAmount: "20", tradeDate: "2024-02-01" })
    expect(swap.status).toBe(201)
    expect(swap.body.baseCurrencyAmount).toBe("10000.00")
    const d = (await get(`/crypto/${id}`)).body
    const eth = d.positions.find((p: any) => p.symbol === "ETH")
    expect(eth).toMatchObject({ balance: 20, totalCostEur: 10000, avgCostBasis: 500 })
    expect(d.totalRealizedPnL).toBe(0)
    // closed BTC position sorts after the open one
    expect(d.positions.map((p: any) => p.symbol)).toEqual(["ETH", "BTC"])
  })

  test("swap accepts an explicit baseCurrencyAmount", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "10000", toSymbol: "BTC", toAmount: "1" })
    const swap = await trade(id, { fromSymbol: "BTC", fromAmount: "1", toSymbol: "ETH", toAmount: "20", baseCurrencyAmount: "12345.67" })
    expect(swap.body.baseCurrencyAmount).toBe("12345.67")
  })

  test("creating a second portfolio leaves the first one's trades, positions and the list untouched", async () => {
    const first = await newPortfolio()
    await trade(first, { fromSymbol: "EUR", fromAmount: "30000", toSymbol: "BTC", toAmount: "1", assetName: "Bitcoin" })
    await trade(first, { fromSymbol: "EUR", fromAmount: "1000", toSymbol: "ETH", toAmount: "0.5" })
    const before = (await get(`/crypto/${first}`)).body

    const second = await newPortfolio()
    expect(second).not.toBe(first)
    await trade(second, { fromSymbol: "EUR", fromAmount: "10", toSymbol: "SHIB", toAmount: "1000" })

    const after = (await get(`/crypto/${first}`)).body
    expect(after.trades).toHaveLength(2)
    expect(after.positions.map((p: any) => p.symbol).sort()).toEqual(["BTC", "ETH"])
    expect(after).toEqual(before)
    // each portfolio only ever sees its own ledger
    expect((await get(`/crypto/${second}`)).body.positions.map((p: any) => p.symbol)).toEqual(["SHIB"])
    const ids = (await get("/crypto")).body.map((p: any) => p.id)
    expect(ids).toContain(first)
    expect(ids).toContain(second)
  })

  test("a sub-cent coin keeps its real price: 1 billion SHIB bought for 5 EUR", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "5", toSymbol: "SHIB", toAmount: "1000000000", assetName: "Shiba Inu" })
    const d = (await get(`/crypto/${id}`)).body
    expect(d.positions[0]).toMatchObject({ symbol: "SHIB", balance: 1_000_000_000, currentPrice: 0.0000085 })
    expect(d.positions[0].avgCostBasis).toBeCloseTo(0.000000005, 12) // 5 EUR / 1e9 coins
    expect(d.positions[0].currentValueEur).toBeCloseTo(8500, 6) // 1e9 × 0.0000085
    expect(d.positions[0].unrealizedPnL).toBeCloseTo(8495, 6)
  })

  test("a coin that is not in the built-in list is found by ticker search", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "100", toSymbol: "NEWCOIN", toAmount: "200" })
    const d = (await get(`/crypto/${id}`)).body
    expect(d.positions[0]).toMatchObject({ symbol: "NEWCOIN", currentPrice: 0.25, currentValueEur: 50 })
  })

  test("positions without a price still return, with null valuation", async () => {
    const id = await newPortfolio()
    await trade(id, { fromSymbol: "EUR", fromAmount: "100", toSymbol: "XRP", toAmount: "200" }) // not in the fake price feed
    const d = (await get(`/crypto/${id}`)).body
    expect(d.positions[0]).toMatchObject({ symbol: "XRP", currentPrice: null, currentValueEur: null, unrealizedPnL: null })
    expect(d.totalCurrentValueOpen ?? d.totalCurrentValueEur).toBeNull()
  })

  test("validation", async () => {
    const id = await newPortfolio()
    const ok = { fromSymbol: "EUR", fromAmount: "100", toSymbol: "BTC", toAmount: "1" }
    expect((await trade(id, { ...ok, tradeDate: "2024-02-31" })).status).toBe(400) // impossible date
    expect((await trade(id, { ...ok, tradeDate: "01/02/2024" })).status).toBe(400)
    expect((await trade(id, { ...ok, fromAmount: "0" })).status).toBe(400)
    expect((await trade(id, { ...ok, fromAmount: "-5" })).status).toBe(400)
    expect((await trade(id, { ...ok, toAmount: "abc" })).status).toBe(400)
    expect((await trade(id, { ...ok, toSymbol: "EUR" })).status).toBe(400) // same symbol
    const r = await trade(id, {})
    expect(r.status).toBe(400)
    expect(r.body.issues.map((i: any) => i.path).sort()).toEqual(["fromAmount", "fromSymbol", "toAmount", "toSymbol"])
    expect((await post(`/crypto/${NIL}/trades`, { tradeDate: "2024-01-01", ...ok })).status).toBe(403) // not editable → forbidden
  })

  test("trades are immutable", async () => {
    const id = await newPortfolio()
    const t = await trade(id, { fromSymbol: "EUR", fromAmount: "100", toSymbol: "BTC", toAmount: "1" })
    const r = await del(`/crypto/${id}/trades/${t.body.id}`)
    expect(r.status).toBe(405)
    expect(r.body.error).toContain("immutable")
  })
})

describe("stock trades & dividends", () => {
  const newPortfolio = async (currency: "EUR" | "USD" = "USD") => (await post("/stocks", { name: unique("s"), currency })).body.id as string
  const trade = (id: string, body: object) => post(`/stocks/${id}/trades`, { tradeDate: "2024-01-01", ...body })

  test("buy → valuation with live price, asset name stored", async () => {
    const id = await newPortfolio("USD")
    const r = await trade(id, { type: "buy", symbol: "aapl", quantity: "10", amount: "800", assetName: "Apple Inc." })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ fromSymbol: "USD", toSymbol: "AAPL" })
    expect([r.body.fromAmount, r.body.toAmount, r.body.baseCurrencyAmount].map(parseFloat)).toEqual([800, 10, 800])

    const d = (await get(`/stocks/${id}`)).body
    expect(d.positions[0]).toMatchObject({
      symbol: "AAPL", name: "Apple Inc.", balance: 10, avgCostBasis: 80, totalCostEur: 800,
      currentPrice: 100, currentValueEur: 1000, unrealizedPnL: 200,
    })
  })

  test("valuation converts the quote into the portfolio currency", async () => {
    const id = await newPortfolio("EUR")
    await trade(id, { type: "buy", symbol: "AAPL", quantity: "10", amount: "800" })
    const p = (await get(`/stocks/${id}`)).body.positions[0]
    expect(p.currentPrice).toBeCloseTo(90) // 100 USD × 0.9
    expect(p.unrealizedPnL).toBeCloseTo(100) // 900 - 800
  })

  test("sell realizes FIFO P&L; oversell is rejected", async () => {
    const id = await newPortfolio("USD")
    await trade(id, { type: "buy", symbol: "AAPL", quantity: "10", amount: "800", tradeDate: "2024-01-01" })
    const sell = await trade(id, { type: "sell", symbol: "AAPL", quantity: "4", amount: "480", tradeDate: "2024-02-01" })
    expect(sell.status).toBe(201)
    expect(sell.body).toMatchObject({ fromSymbol: "AAPL", toSymbol: "USD" })
    expect([sell.body.fromAmount, sell.body.toAmount].map(parseFloat)).toEqual([4, 480]) // sold 4 shares for 480 USD
    const p = (await get(`/stocks/${id}`)).body.positions[0]
    expect(p).toMatchObject({ balance: 6, realizedPnL: 160 }) // 480 − 4×80

    const over = await trade(id, { type: "sell", symbol: "AAPL", quantity: "7", amount: "700" })
    expect(over.status).toBe(400)
    expect(over.body.error).toContain("Insufficient balance")
    expect((await trade(id, { type: "sell", symbol: "MSFT", quantity: "1", amount: "1" })).status).toBe(400)
  })

  test("validation", async () => {
    const id = await newPortfolio()
    const ok = { type: "buy", symbol: "AAPL", quantity: "1", amount: "1" }
    expect((await trade(id, { ...ok, type: "swap" })).status).toBe(400)
    expect((await trade(id, { ...ok, quantity: "0" })).status).toBe(400)
    expect((await trade(id, { ...ok, amount: "x" })).status).toBe(400)
    expect((await trade(id, { ...ok, symbol: "  " })).status).toBe(400)
    expect((await trade(id, { ...ok, tradeDate: "yesterday" })).status).toBe(400)
  })

  test("trades are immutable but dividends are not", async () => {
    const id = await newPortfolio()
    const t = await trade(id, { type: "buy", symbol: "AAPL", quantity: "1", amount: "1" })
    expect((await del(`/stocks/${id}/trades/${t.body.id}`)).status).toBe(405)

    const div = await post(`/stocks/${id}/dividends`, { symbol: "aapl", paymentDate: "2024-03-01", amount: "12.50" })
    expect(div.status).toBe(201)
    expect(div.body.symbol).toBe("AAPL")
    expect((await del(`/stocks/${id}/dividends/${div.body.id}`)).status).toBe(204)
    expect((await get(`/stocks/${id}`)).body.dividends).toEqual([])
  })

  test("dividends are summed per position and in total, without affecting cost basis", async () => {
    const id = await newPortfolio()
    await trade(id, { type: "buy", symbol: "AAPL", quantity: "10", amount: "800" })
    await trade(id, { type: "buy", symbol: "VWRL", quantity: "5", amount: "400" })
    await post(`/stocks/${id}/dividends`, { symbol: "AAPL", paymentDate: "2024-03-01", amount: "10" })
    await post(`/stocks/${id}/dividends`, { symbol: "AAPL", paymentDate: "2024-06-01", amount: "12.5" })
    await post(`/stocks/${id}/dividends`, { symbol: "VWRL", paymentDate: "2024-06-01", amount: "7" })
    const d = (await get(`/stocks/${id}`)).body
    expect(d.positions.find((p: any) => p.symbol === "AAPL")).toMatchObject({ totalDividends: 22.5, totalCostEur: 800 })
    expect(d.positions.find((p: any) => p.symbol === "VWRL").totalDividends).toBe(7)
    expect(d.totalDividends).toBe(29.5)
    expect(d.dividends.map((x: any) => x.paymentDate)).toEqual(["2024-03-01", "2024-06-01", "2024-06-01"]) // ordered by date
  })

  test("dividend validation", async () => {
    const id = await newPortfolio()
    expect((await post(`/stocks/${id}/dividends`, { symbol: "AAPL", paymentDate: "2024-03-01", amount: "0" })).status).toBe(400)
    expect((await post(`/stocks/${id}/dividends`, { symbol: "AAPL", paymentDate: "bad", amount: "1" })).status).toBe(400)
    expect((await post(`/stocks/${id}/dividends`, { paymentDate: "2024-03-01", amount: "1" })).status).toBe(400)
  })

  test("a dividend cannot be deleted through another portfolio", async () => {
    const a = await newPortfolio(), b = await newPortfolio()
    const div = (await post(`/stocks/${a}/dividends`, { symbol: "AAPL", paymentDate: "2024-03-01", amount: "1" })).body
    await del(`/stocks/${b}/dividends/${div.id}`)
    expect((await get(`/stocks/${a}`)).body.dividends).toHaveLength(1)
  })
})

describe("metal lots & sales", () => {
  const newPortfolio = async (currency: "EUR" | "USD" = "EUR") => (await post("/metals", { name: unique("m"), currency })).body.id as string
  const lot = (id: string, body: object = {}) =>
    post(`/metals/${id}/lots`, { purchaseDate: "2024-01-01", metal: "Gold", weightPerPiece: "31.1035", pricePerPiece: "1500", ...body })

  test("add a lot: defaults, normalised metal name", async () => {
    const id = await newPortfolio()
    const r = await lot(id, { metal: "  GOLD ", itemName: " Krugerrand ", quantity: 2 })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ metal: "gold", itemName: "Krugerrand", unit: "g", quantity: 2 })
    expect(parseFloat(r.body.pricePerPiece)).toBe(1500)
    expect((await lot(id)).body.quantity).toBe(1) // default quantity
  })

  test("quantity is rounded to a whole number, minimum 1", async () => {
    const id = await newPortfolio()
    expect((await lot(id, { quantity: 2.6 })).body.quantity).toBe(3)
    expect((await lot(id, { quantity: 0.2 })).body.quantity).toBe(1)
  })

  test("valuation uses weight × spot price, with ounces converted to grams", async () => {
    const id = await newPortfolio("USD")
    await lot(id, { weightPerPiece: "1", unit: "oz", quantity: 2, pricePerPiece: "1800" })
    const d = (await get(`/metals/${id}`)).body
    const l = d.lots[0]
    // 1 troy oz × 2000 USD/oz... the service converts oz→g (31.1035) and USD/oz→USD/g (÷31.1035)
    expect(l.currentValuePerPiece).toBeCloseTo(2000, 4)
    expect(l.unrealizedPnL).toBeCloseTo(2 * (2000 - 1800), 3)
    expect(d.totalInvestedOpen).toBe(3600)
    expect(d.totalCurrentValueOpen).toBeCloseTo(4000, 3)
    expect(d.totalUnrealizedPnL).toBeCloseTo(400, 3)
  })

  test("lots of metals without a price give a null total", async () => {
    const id = await newPortfolio()
    await lot(id, { metal: "platinum" }) // not in the fake feed
    const d = (await get(`/metals/${id}`)).body
    expect(d.lots[0].currentPricePerGram).toBeNull()
    expect(d.totalCurrentValueOpen).toBeNull()
    expect(d.totalUnrealizedPnL).toBeNull()
  })

  test("sales: realized P&L per lot, remaining quantity, and over-selling is rejected", async () => {
    const id = await newPortfolio()
    const l = (await lot(id, { quantity: 5, pricePerPiece: "100" })).body
    const sale = await post(`/metals/${id}/lots/${l.id}/sales`, { saleDate: "2024-02-01", quantitySold: 2, totalReceived: "260" })
    expect(sale.status).toBe(201)

    let d = (await get(`/metals/${id}`)).body
    expect(d.lots[0]).toMatchObject({ remainingQuantity: 3, realizedPnL: 60 }) // 260 − 2×100
    expect(d.totalRealizedPnL).toBe(60)
    expect(d.totalInvestedOpen).toBe(300) // only the 3 remaining pieces

    const over = await post(`/metals/${id}/lots/${l.id}/sales`, { saleDate: "2024-03-01", quantitySold: 4, totalReceived: "500" })
    expect(over.status).toBe(400)
    expect(over.body.error).toContain("only 3 remaining")

    // selling the rest empties the lot
    await post(`/metals/${id}/lots/${l.id}/sales`, { saleDate: "2024-03-01", quantitySold: 3, totalReceived: "330" })
    d = (await get(`/metals/${id}`)).body
    expect(d.lots[0].remainingQuantity).toBe(0)
    expect(d.totalInvestedOpen).toBe(0)
  })

  test("sale validation and wrong-portfolio / unknown lot", async () => {
    const id = await newPortfolio(), other = await newPortfolio()
    const l = (await lot(id, { quantity: 1 })).body
    const url = `/metals/${id}/lots/${l.id}/sales`
    expect((await post(url, { saleDate: "2024-02-01", quantitySold: 0, totalReceived: "1" })).status).toBe(400)
    expect((await post(url, { saleDate: "2024-02-01", quantitySold: -1, totalReceived: "1" })).status).toBe(400)
    expect((await post(url, { saleDate: "bad", quantitySold: 1, totalReceived: "1" })).status).toBe(400)
    expect((await post(url, { saleDate: "2024-02-01", quantitySold: 1, totalReceived: "abc" })).status).toBe(400)
    expect((await post(`/metals/${other}/lots/${l.id}/sales`, { saleDate: "2024-02-01", quantitySold: 1, totalReceived: "1" })).status).toBe(404)
    expect((await post(`/metals/${id}/lots/${NIL}/sales`, { saleDate: "2024-02-01", quantitySold: 1, totalReceived: "1" })).status).toBe(404)
  })

  test("lot validation", async () => {
    const id = await newPortfolio()
    expect((await lot(id, { metal: " " })).status).toBe(400)
    expect((await lot(id, { weightPerPiece: "0" })).status).toBe(400)
    expect((await lot(id, { weightPerPiece: "heavy" })).status).toBe(400)
    expect((await lot(id, { pricePerPiece: "-1" })).status).toBe(400)
    expect((await lot(id, { unit: "lb" })).status).toBe(400)
    expect((await lot(id, { quantity: 0 })).status).toBe(400)
    expect((await lot(id, { purchaseDate: "2024-00-10" })).status).toBe(400)
    expect((await post(`/metals/${NIL}/lots`, { purchaseDate: "2024-01-01", metal: "gold", weightPerPiece: "1", pricePerPiece: "1" })).status).toBe(403)
  })
})

describe("price history endpoints", () => {
  for (const [base, symbol, firstEur] of [["/crypto", "btc", 50000], ["/stocks", "vwrl", 80]] as const) {
    describe(base, () => {
      test("returns the series with the symbol, currency and range echoed", async () => {
        const r = await get(`${base}/history/${symbol}?range=6m&currency=EUR`)
        expect(r.status).toBe(200)
        expect(r.body).toMatchObject({ symbol: symbol.toUpperCase(), currency: "EUR", range: "6m" })
        expect(r.body.points.length).toBeGreaterThan(0)
        expect(r.body.points[0]).toEqual({ t: expect.any(Number), v: firstEur })
      })

      test("range defaults to 1y and currency to EUR", async () => {
        const r = await get(`${base}/history/${symbol}`)
        expect(r.body).toMatchObject({ range: "1y", currency: "EUR" })
      })

      test("an unknown symbol gives an empty series, not an error", async () => {
        const r = await get(`${base}/history/zzzznope`)
        expect(r.status).toBe(200)
        expect(r.body.points).toEqual([])
      })

      test("a bad range or currency is a 400 with a readable message", async () => {
        const r = await get(`${base}/history/${symbol}?range=5y`)
        expect(r.status).toBe(400)
        expect(r.body.error).toContain("range must be one of")
        expect((await get(`${base}/history/${symbol}?currency=GBP`)).status).toBe(400)
      })
    })
  }
})

describe("crypto history when the price provider is unavailable", () => {
  test("a rate-limited provider with no fallback is a 503 with a message and Retry-After (not an empty chart)", async () => {
    fakeFetch.rateLimited.add("coingecko")
    try {
      const r = await get("/crypto/history/xyzcoin?range=1y")
      expect(r.status).toBe(503)
      expect(r.body.error).toContain("temporarily unavailable")
      expect(r.body.retryAfter).toBeGreaterThan(0)
    } finally {
      fakeFetch.reset()
    }
  })

  test("with Yahoo as a fallback the chart still loads", async () => {
    fakeFetch.rateLimited.add("coingecko")
    try {
      const r = await get("/crypto/history/doge?range=1m")
      expect(r.status).toBe(200)
      expect(r.body.points.length).toBeGreaterThan(0)
    } finally {
      fakeFetch.reset()
    }
  })
})
