import { describe, expect, test } from "bun:test"
import { computeFifo, investmentSymbols } from "./fifo"

const buy = (date: string, eur: string, qty: string, sym = "BTC") => ({
  tradeDate: date, fromSymbol: "EUR", fromAmount: eur, toSymbol: sym, toAmount: qty, baseCurrencyAmount: eur,
})
const sell = (date: string, qty: string, eur: string, sym = "BTC") => ({
  tradeDate: date, fromSymbol: sym, fromAmount: qty, toSymbol: "EUR", toAmount: eur, baseCurrencyAmount: eur,
})

describe("computeFifo", () => {
  test("no trades → zeros", () => {
    expect(computeFifo([], "BTC", "EUR")).toEqual({ balance: 0, avgCostBasis: 0, totalCost: 0, realizedPnL: 0 })
  })

  test("single buy", () => {
    const r = computeFifo([buy("2024-01-01", "1000", "0.5")], "BTC", "EUR")
    expect(r.balance).toBeCloseTo(0.5)
    expect(r.avgCostBasis).toBeCloseTo(2000)
    expect(r.totalCost).toBeCloseTo(1000)
    expect(r.realizedPnL).toBe(0)
  })

  test("sell consumes oldest lot first", () => {
    const trades = [
      buy("2024-01-01", "1000", "1"), // 1000/unit
      buy("2024-02-01", "3000", "1"), // 3000/unit
      sell("2024-03-01", "1", "2500"),
    ]
    const r = computeFifo(trades, "BTC", "EUR")
    expect(r.realizedPnL).toBeCloseTo(1500) // sold 1 @2500 vs cost 1000
    expect(r.balance).toBeCloseTo(1)
    expect(r.avgCostBasis).toBeCloseTo(3000)
    expect(r.totalCost).toBeCloseTo(3000)
  })

  test("sell spanning two lots", () => {
    const trades = [
      buy("2024-01-01", "1000", "1"),
      buy("2024-02-01", "3000", "1"),
      sell("2024-03-01", "1.5", "6000"), // 4000/unit
    ]
    const r = computeFifo(trades, "BTC", "EUR")
    // 1 @ (4000-1000) + 0.5 @ (4000-3000)
    expect(r.realizedPnL).toBeCloseTo(3500)
    expect(r.balance).toBeCloseTo(0.5)
    expect(r.totalCost).toBeCloseTo(1500)
  })

  test("sorts by trade date regardless of input order", () => {
    const trades = [sell("2024-03-01", "1", "2500"), buy("2024-02-01", "3000", "1"), buy("2024-01-01", "1000", "1")]
    expect(computeFifo(trades, "BTC", "EUR").realizedPnL).toBeCloseTo(1500)
  })

  test("fully sold position has zero avgCostBasis", () => {
    const r = computeFifo([buy("2024-01-01", "1000", "1"), sell("2024-02-01", "1", "1200")], "BTC", "EUR")
    expect(r.balance).toBeCloseTo(0)
    expect(r.avgCostBasis).toBe(0)
    expect(r.realizedPnL).toBeCloseTo(200)
  })

  test("only the requested symbol is considered", () => {
    const trades = [buy("2024-01-01", "1000", "1", "BTC"), buy("2024-01-02", "500", "10", "ETH")]
    expect(computeFifo(trades, "ETH", "EUR").totalCost).toBeCloseTo(500)
  })

  test("swap transfers cost basis with zero realized P&L", () => {
    const trades = [
      buy("2024-01-01", "1000", "1"), // BTC @1000
      // swap 1 BTC → 10 ETH; baseCurrencyAmount carries the cost basis (1000)
      { tradeDate: "2024-02-01", fromSymbol: "BTC", fromAmount: "1", toSymbol: "ETH", toAmount: "10", baseCurrencyAmount: "1000" },
    ]
    const btc = computeFifo(trades, "BTC", "EUR")
    expect(btc.realizedPnL).toBeCloseTo(0)
    expect(btc.balance).toBeCloseTo(0)
    const eth = computeFifo(trades, "ETH", "EUR")
    expect(eth.balance).toBeCloseTo(10)
    expect(eth.totalCost).toBeCloseTo(1000)
    expect(eth.avgCostBasis).toBeCloseTo(100)
  })

  test("oversell does not go negative", () => {
    const r = computeFifo([buy("2024-01-01", "1000", "1"), sell("2024-02-01", "2", "4000")], "BTC", "EUR")
    expect(r.balance).toBeCloseTo(0)
  })

  test("respects a non-EUR base currency", () => {
    const t = { tradeDate: "2024-01-01", fromSymbol: "USD", fromAmount: "100", toSymbol: "AAPL", toAmount: "2", baseCurrencyAmount: "100" }
    const r = computeFifo([t], "AAPL", "USD")
    expect(r.avgCostBasis).toBeCloseTo(50)
  })
})

describe("investmentSymbols", () => {
  test("returns unique non-base symbols", () => {
    const trades = [
      buy("2024-01-01", "1", "1", "BTC"),
      buy("2024-01-02", "1", "1", "BTC"),
      sell("2024-01-03", "1", "1", "ETH"),
    ]
    expect(investmentSymbols(trades, "EUR").sort()).toEqual(["BTC", "ETH"])
  })
})
