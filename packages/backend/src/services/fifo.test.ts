import { describe, expect, test } from "bun:test"
import { computeFifo, investmentSymbols } from "./fifo"
import { Decimal, cents } from "./money"

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

describe("computeFifo is exact (the float traps)", () => {
  test("a thousand tiny buys add up exactly — they used to drift to 99.9999999999986", () => {
    const trades = Array.from({ length: 1000 }, (_, i) => buy(`2024-01-${String((i % 28) + 1).padStart(2, "0")}`, "0.10", "0.00000001"))
    const r = computeFifo(trades, "BTC", "EUR")
    expect(r.totalCost).toBe(100)
    expect(r.balance).toBe(0.00001)
    expect(r.avgCostBasis).toBe(10_000_000)
  })

  test("0.1 + 0.2 bought, 0.3 sold: nothing is left, not 5.55e-17", () => {
    const r = computeFifo([buy("2024-01-01", "10", "0.1"), buy("2024-01-02", "20", "0.2"), sell("2024-01-03", "0.3", "30")], "BTC", "EUR")
    expect(r).toEqual({ balance: 0, avgCostBasis: 0, totalCost: 0, realizedPnL: 0 })
    expect(Object.is(r.realizedPnL, -0)).toBe(false)
  })

  test("a lot sold in thirds at the price paid realises exactly nothing", () => {
    const r = computeFifo([buy("2024-01-01", "100", "3"), sell("2024-02-01", "1", "33.333333"), sell("2024-02-02", "1", "33.333333"), sell("2024-02-03", "1", "33.333334")], "BTC", "EUR")
    expect(r.realizedPnL).toBe(0) // not +0.00 / -0.00 from float residue, which would show as a red −€0,00
    expect(r.balance).toBe(0)
  })

  test("a partly sold lot keeps its remaining cost exactly (no per-unit rounding)", () => {
    // 100 EUR for 3 units: selling 1 unit leaves 2 units that cost 66.666… in total
    const r = computeFifo([buy("2024-01-01", "100", "3"), sell("2024-02-01", "1", "50")], "BTC", "EUR")
    expect(r.totalCost).toBe(66.67)
    expect(r.realizedPnL).toBe(16.67) // 50 − 33.333…
    expect(r.balance).toBe(2)
    expect(r.avgCostBasis).toBeCloseTo(100 / 3, 12)
  })

  test("a coin that costs a fraction of a cent keeps its price (cents rounding applies to money totals, not to unit prices)", () => {
    const r = computeFifo([buy("2024-01-01", "5", "1000000000", "SHIB")], "SHIB", "EUR")
    expect(r.avgCostBasis).toBeCloseTo(0.000000005, 15)
    expect(r.totalCost).toBe(5)
  })
})

describe("computeFifo: invariants over random trade sequences", () => {
  // a small deterministic generator, so a failure can be reproduced
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`seed ${seed}: units and money are conserved, and a full sell-off realises proceeds minus cost`, () => {
      const rand = rng(seed)
      const qty = () => (Math.floor(rand() * 9_999_999) + 1) / 100_000_000 // up to 8 decimals
      const eur = () => (Math.floor(rand() * 99_999) + 1) / 100 // whole cents
      const buys = Array.from({ length: 5 + Math.floor(rand() * 20) }, (_, i) => ({ q: qty(), e: eur(), d: `2024-01-${String(i + 1).padStart(2, "0")}` }))
      const bought = buys.reduce((s, b) => s.plus(b.q), new Decimal(0))
      const paid = buys.reduce((s, b) => s.plus(b.e), new Decimal(0))
      const trades = buys.map((b) => buy(b.d, String(b.e), b.q.toFixed(8)))

      // sell a random part first
      const partQty = bought.times(rand()).toDecimalPlaces(8, Decimal.ROUND_DOWN)
      const partEur = new Decimal(eur())
      const afterPart = computeFifo([...trades, sell("2024-03-01", partQty.toFixed(8), partEur.toFixed(2))], "BTC", "EUR")
      expect(afterPart.balance).toBeCloseTo(bought.minus(partQty).toNumber(), 8) // units are conserved
      expect(afterPart.balance).toBeGreaterThanOrEqual(0)
      expect(afterPart.totalCost).toBeGreaterThanOrEqual(0)
      // money is conserved: proceeds = realised + the cost of what was sold (paid − cost still open)
      const costSold = paid.minus(afterPart.totalCost)
      expect(Math.abs(partEur.minus(costSold).minus(afterPart.realizedPnL).toNumber())).toBeLessThanOrEqual(0.011)

      // then sell the rest: nothing is left, and the result is proceeds minus everything that was paid
      const rest = bought.minus(partQty)
      const restEur = new Decimal(eur())
      const all = computeFifo([...trades, sell("2024-03-01", partQty.toFixed(8), partEur.toFixed(2)), sell("2024-03-02", rest.toFixed(8), restEur.toFixed(2))], "BTC", "EUR")
      expect(all.balance).toBe(0)
      expect(all.totalCost).toBe(0)
      expect(all.avgCostBasis).toBe(0)
      expect(all.realizedPnL).toBe(cents(partEur.plus(restEur).minus(paid))) // exact, to the cent
    })
  }
})
