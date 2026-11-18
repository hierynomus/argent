import { describe, expect, test } from "bun:test"
import { buildPositions, summarizePositions } from "./positions"

const buy = (sym: string, eur: string, qty: string, date = "2024-01-01") => ({ tradeDate: date, fromSymbol: "EUR", fromAmount: eur, toSymbol: sym, toAmount: qty, baseCurrencyAmount: eur })
const sell = (sym: string, qty: string, eur: string, date = "2024-02-01") => ({ tradeDate: date, fromSymbol: sym, fromAmount: qty, toSymbol: "EUR", toAmount: eur, baseCurrencyAmount: eur })
const positions = (trades: any[], prices: Record<string, number | null>, symbols = [...new Set(trades.flatMap((t) => [t.fromSymbol, t.toSymbol]).filter((s) => s !== "EUR"))]) =>
  buildPositions(trades, symbols, [{ symbol: "BTC", name: "Bitcoin", assetForm: null }], prices, "EUR")

describe("buildPositions", () => {
  test("values a position, rounds money to cents and leaves unit prices alone", () => {
    const [p] = positions([buy("BTC", "100", "3")], { BTC: 40.123456 })
    expect(p).toMatchObject({ symbol: "BTC", name: "Bitcoin", balance: 3, totalCost: 100, currentPrice: 40.123456, realizedPnL: 0 })
    expect(p.currentValue).toBe(120.37) // 3 × 40.123456 = 120.370368
    expect(p.unrealizedPnL).toBe(20.37)
    expect(p.avgCostBasis).toBeCloseTo(100 / 3, 12)
  })

  test("a sub-cent coin is valued correctly: 1 billion SHIB bought for 5 EUR, now 0.0000085", () => {
    const [p] = positions([buy("SHIB", "5", "1000000000")], { SHIB: 0.0000085 })
    expect(p.currentValue).toBe(8500)
    expect(p.unrealizedPnL).toBe(8495)
    expect(p.currentPrice).toBe(0.0000085)
  })

  test("no price → no value and no unrealized P&L; an unknown name falls back to the symbol", () => {
    const [p] = positions([buy("XYZ", "10", "1")], {})
    expect(p).toMatchObject({ name: "XYZ", currentPrice: null, currentValue: null, unrealizedPnL: null })
  })

  test("open positions come first, closed ones after, each group alphabetical", () => {
    const trades = [buy("ZED", "1", "1"), buy("ADA", "1", "1"), buy("OLD", "1", "1"), sell("OLD", "1", "2"), buy("BTC", "1", "1")]
    expect(positions(trades, {}).map((p) => p.symbol)).toEqual(["ADA", "BTC", "ZED", "OLD"])
  })

  test("extra fields are added to each position", () => {
    const [p] = buildPositions([buy("BTC", "1", "1")], ["BTC"], [], {}, "EUR", (s) => ({ dividends: s.length }))
    expect(p.dividends).toBe(3)
  })
})

describe("summarizePositions", () => {
  test("sums exactly: ten positions of 0.1 are 1, not 0.9999999999999999", () => {
    const ps = positions(Array.from({ length: 10 }, (_, i) => buy(`S${i}`, "0.10", "1")), Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`S${i}`, 0.1])))
    expect(summarizePositions(ps)).toEqual({ totalOpenCost: 1, totalCurrentValue: 1, totalRealizedPnL: 0, totalUnrealizedPnL: 0 })
  })

  test("the value is unknown as soon as one open position has no price (a partial sum would understate it)", () => {
    const ps = positions([buy("BTC", "100", "1"), buy("XYZ", "10", "1")], { BTC: 150 })
    expect(summarizePositions(ps)).toMatchObject({ totalOpenCost: 110, totalCurrentValue: null, totalUnrealizedPnL: null })
  })

  test("closed positions need no price, and their realised result still counts", () => {
    const ps = positions([buy("BTC", "100", "1"), buy("OLD", "10", "1"), sell("OLD", "1", "25")], { BTC: 150 })
    expect(summarizePositions(ps)).toEqual({ totalOpenCost: 100, totalCurrentValue: 150, totalRealizedPnL: 15, totalUnrealizedPnL: 50 })
  })

  test("nothing held: no value to report", () => {
    expect(summarizePositions(positions([], {}))).toEqual({ totalOpenCost: 0, totalCurrentValue: null, totalRealizedPnL: 0, totalUnrealizedPnL: null })
  })
})
