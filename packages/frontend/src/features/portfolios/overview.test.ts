import { describe, expect, test } from "vitest"
import { cryptoDetail, lot, metalDetail, stockDetail, stockPosition } from "../../../test/fixtures"
import { aggregateAssets, aggregateMetals } from "./overview"

const pos = (symbol: string, over: object = {}) => ({
  symbol, name: symbol, assetForm: null, balance: 1, avgCostBasis: 100, totalCostEur: 100, realizedPnL: 0, currentPrice: 150, currentValueEur: 150, unrealizedPnL: 50, ...over,
})
const detail = (name: string, positions: any[], over: object = {}) => cryptoDetail({ id: name, name, positions, ...over })

describe("aggregateAssets", () => {
  test("an asset held in two portfolios is one row with summed balance, cost and value", () => {
    const [g] = aggregateAssets([
      detail("Main", [pos("BTC", { balance: 1, totalCostEur: 30000, currentValueEur: 50000, currentPrice: 50000 })]),
      detail("Second", [pos("BTC", { balance: 0.5, totalCostEur: 20000, currentValueEur: 25000, currentPrice: 50000 })]),
    ])
    expect(g.positions).toHaveLength(1)
    expect(g.positions[0]).toMatchObject({ symbol: "BTC", balance: 1.5, totalCostEur: 50000, currentValueEur: 75000, currentPrice: 50000, unrealizedPnL: 25000, heldIn: ["Main", "Second"] })
    expect(g.positions[0].avgCostBasis).toBeCloseTo(50000 / 1.5)
  })

  test("totals add up over all assets, unrealized is value minus cost, realized is summed", () => {
    const [g] = aggregateAssets([
      detail("A", [pos("BTC", { totalCostEur: 100, currentValueEur: 150, realizedPnL: 10 })]),
      detail("B", [pos("ETH", { totalCostEur: 200, currentValueEur: 180, realizedPnL: -5 })]),
    ])
    expect(g).toMatchObject({ openCost: 300, currentValue: 330, unrealized: 30, realized: 5, portfolioNames: ["A", "B"] })
  })

  test("the biggest holdings come first, assets without a price last", () => {
    const [g] = aggregateAssets([
      detail("A", [pos("SMALL", { currentValueEur: 10 }), pos("NOPRICE", { currentValueEur: null, currentPrice: null, unrealizedPnL: null }), pos("BIG", { currentValueEur: 900 })]),
    ])
    expect(g.positions.map((p) => p.symbol)).toEqual(["BIG", "SMALL", "NOPRICE"])
  })

  test("without a price for some asset the portfolio value and unrealized P&L are unknown (as in a single portfolio)", () => {
    const [g] = aggregateAssets([detail("A", [pos("BTC"), pos("OBSCURE", { currentValueEur: null, currentPrice: null, unrealizedPnL: null })])])
    expect(g.currentValue).toBeNull()
    expect(g.unrealized).toBeNull()
    expect(g.openCost).toBe(200)
    expect(g.positions.find((p) => p.symbol === "OBSCURE")).toMatchObject({ currentValueEur: null, unrealizedPnL: null })
  })

  test("EUR and USD portfolios are never added together: one group per currency", () => {
    const groups = aggregateAssets([
      detail("Euro", [pos("BTC", { totalCostEur: 100, currentValueEur: 150 })], { currency: "EUR" }),
      detail("Dollar", [pos("BTC", { totalCostEur: 1000, currentValueEur: 1500 })], { currency: "USD" }),
    ])
    expect(groups.map((g) => g.currency)).toEqual(["EUR", "USD"])
    expect(groups[0]).toMatchObject({ openCost: 100, currentValue: 150, portfolioNames: ["Euro"] })
    expect(groups[1]).toMatchObject({ openCost: 1000, currentValue: 1500, portfolioNames: ["Dollar"] })
  })

  test("a fully sold position keeps its realised result and has no average cost", () => {
    const [g] = aggregateAssets([detail("A", [pos("OLD", { balance: 0, totalCostEur: 0, currentValueEur: 0, realizedPnL: 42, unrealizedPnL: 0 })])])
    expect(g.positions[0]).toMatchObject({ balance: 0, avgCostBasis: 0, realizedPnL: 42 })
    expect(g.realized).toBe(42)
  })

  test("stock dividends are summed per asset and in total", () => {
    const a = stockDetail({ id: "a", name: "A", currency: "EUR", positions: [stockPosition({ symbol: "AAPL", totalDividends: 10 })] })
    const b = stockDetail({ id: "b", name: "B", currency: "EUR", positions: [stockPosition({ symbol: "AAPL", totalDividends: 5 }), stockPosition({ symbol: "MSFT", totalDividends: 1 })] })
    const [g] = aggregateAssets([a, b])
    expect(g.positions.find((p) => p.symbol === "AAPL")!.totalDividends).toBe(15)
    expect(g.dividends).toBe(16)
  })

  test("nothing to aggregate gives no groups", () => expect(aggregateAssets([])).toEqual([]))
  test("a portfolio without positions still counts as part of its group", () => {
    const [g] = aggregateAssets([detail("Empty", []), detail("Full", [pos("BTC")])])
    expect(g.portfolioNames).toEqual(["Empty", "Full"])
    expect(g.positions).toHaveLength(1)
  })
})

describe("aggregateMetals", () => {
  const l = (metal: string, over: object = {}) => lot({ metal, remainingQuantity: 1, quantity: 1, weightPerPiece: "31.1", unit: "g", pricePerPiece: "1000", currentValuePerPiece: 1200, unrealizedPnL: 200, realizedPnL: 0, ...over } as any)
  const md = (name: string, lots: any[], over: object = {}) => metalDetail({ id: name, name, lots, totalInvestedOpen: 0, totalCurrentValueOpen: 0, totalUnrealizedPnL: 0, totalRealizedPnL: 0, ...over })

  test("lots of the same metal across portfolios become one row: pieces, grams, cost and value", () => {
    const [g] = aggregateMetals([
      md("A", [l("gold", { remainingQuantity: 2, quantity: 2 })], { totalInvestedOpen: 2000, totalCurrentValueOpen: 2400 }),
      md("B", [l("gold", { unit: "oz", weightPerPiece: "1" }), l("silver", { weightPerPiece: "100", pricePerPiece: "80", currentValuePerPiece: 90 })], { totalInvestedOpen: 1080, totalCurrentValueOpen: 1290 }),
    ])
    const gold = g.rows.find((r) => r.metal === "gold")!
    expect(gold).toMatchObject({ pieces: 3, lots: 2, cost: 3000, value: 3600, unrealized: 600 })
    expect(gold.grams).toBeCloseTo(2 * 31.1 + 31.1034768, 4) // two 31.1 g pieces and one troy ounce
    expect(g.rows.find((r) => r.metal === "silver")).toMatchObject({ pieces: 1, grams: 100, cost: 80, value: 90, unrealized: 10 })
    expect(g).toMatchObject({ openCost: 3080, currentValue: 3690, unrealized: 610, portfolioNames: ["A", "B"] })
    expect(g.rows.map((r) => r.metal)).toEqual(["gold", "silver"]) // biggest value first
  })

  test("sold-out lots do not count as holdings but their realised result does", () => {
    const [g] = aggregateMetals([md("A", [l("gold", { remainingQuantity: 0, quantity: 1, realizedPnL: 300 })], { totalRealizedPnL: 300 })])
    expect(g.rows[0]).toMatchObject({ metal: "gold", pieces: 0, lots: 0, cost: 0, value: 0, realized: 300 })
    expect(g.realized).toBe(300)
  })

  test("a lot without a live price makes the metal's value unknown", () => {
    const [g] = aggregateMetals([md("A", [l("gold"), l("gold", { currentValuePerPiece: null, unrealizedPnL: null })], { totalInvestedOpen: 2000, totalCurrentValueOpen: null })])
    expect(g.rows[0]).toMatchObject({ value: null, unrealized: null, pieces: 2 })
    expect(g.currentValue).toBeNull()
  })

  test("EUR and USD portfolios stay in separate groups", () => {
    const groups = aggregateMetals([md("E", [l("gold")], { currency: "EUR", totalInvestedOpen: 1000, totalCurrentValueOpen: 1200 }), md("U", [l("gold")], { currency: "USD", totalInvestedOpen: 900, totalCurrentValueOpen: 1100 })])
    expect(groups.map((g) => [g.currency, g.openCost, g.currentValue])).toEqual([["EUR", 1000, 1200], ["USD", 900, 1100]])
  })
})
