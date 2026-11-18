import { describe, expect, test } from "bun:test"
import { account, debt, portfolio, transaction } from "../../../test/fixtures"
import { bankingLabel, summarize, toHoldings, unrealizedLabel, type DashboardInput, type Holding } from "./summarize"

const empty: DashboardInput = { accounts: [], mortgages: [], loans: [], crypto: [], metals: [], stocks: [], monthTransactions: [] }
const holding = (over: Partial<Holding> = {}): Holding => ({ currency: "EUR", value: 1000, unrealizedPnL: 100, loading: false, ...over })
const fmt = (n: number) => `€${n.toFixed(2)}`

describe("summarize: net worth", () => {
  test("nothing at all → zeros", () => {
    const s = summarize(empty)
    expect(s).toMatchObject({ netWorth: 0, totalAssets: 0, totalLiabilities: 0, accountsTotal: 0, hasExcludedNonEur: false, netWorthLoading: false })
  })

  test("assets = accounts + crypto + metals + stocks; liabilities = mortgages + loans; net worth is the difference", () => {
    const s = summarize({
      ...empty,
      accounts: [account({ balance: "1000.50" }), account({ id: "a2", balance: "500.25" })],
      crypto: [holding({ value: 2000 })],
      metals: [holding({ value: 300 })],
      stocks: [holding({ value: 4000 })],
      mortgages: [debt({ totalCurrentBalance: 100_000, totalMonthlyPayment: 600 })],
      loans: [debt({ id: "l", totalCurrentBalance: 5000, totalMonthlyPayment: 150 })],
    })
    expect(s.accountsTotal).toBeCloseTo(1500.75)
    expect(s.totalAssets).toBeCloseTo(1500.75 + 2000 + 300 + 4000)
    expect(s.totalLiabilities).toBe(105_000)
    expect(s.netWorth).toBeCloseTo(s.totalAssets - 105_000)
    expect(s.mortgages).toEqual({ balance: 100_000, monthly: 600, count: 1 })
    expect(s.loans).toEqual({ balance: 5000, monthly: 150, count: 1 })
  })

  test("net worth can be negative (debts exceed assets)", () => {
    expect(summarize({ ...empty, mortgages: [debt({ totalCurrentBalance: 1000 })] }).netWorth).toBe(-1000)
  })

  test("a portfolio without a value yet counts as 0, not NaN", () => {
    const s = summarize({ ...empty, crypto: [holding({ value: null, unrealizedPnL: null })] })
    expect(s.crypto.total).toBe(0)
    expect(s.netWorth).toBe(0)
  })

  test("sums several portfolios of one kind", () => {
    const s = summarize({ ...empty, stocks: [holding({ value: 100, unrealizedPnL: 10 }), holding({ value: 250, unrealizedPnL: -4 })] })
    expect(s.stocks).toMatchObject({ total: 350, unrealizedPnL: 6, count: 2 })
  })
})

describe("summarize: only EUR is counted (there are no exchange rates)", () => {
  test("USD portfolios are excluded from the totals — for every kind of holding", () => {
    const s = summarize({
      ...empty,
      crypto: [holding({ value: 1000 }), holding({ currency: "USD", value: 99_999, unrealizedPnL: 5000 })],
      metals: [holding({ currency: "USD", value: 99_999 })],
      stocks: [holding({ currency: "USD", value: 99_999 })],
    })
    expect(s.crypto.total).toBe(1000)
    expect(s.crypto.unrealizedPnL).toBe(100) // the USD portfolio's P&L is not added either
    expect(s.metals.total).toBe(0)
    expect(s.stocks.total).toBe(0)
    expect(s.totalAssets).toBe(1000)
    expect(s.hasExcludedNonEur).toBe(true)
  })

  test("USD accounts, mortgages and loans are excluded as well", () => {
    const s = summarize({
      ...empty,
      accounts: [account({ balance: "100.00" }), account({ id: "u", currency: "USD", balance: "9999.00" })],
      mortgages: [debt({ currency: "USD", totalCurrentBalance: 1_000_000 })],
      loans: [debt({ id: "l", currency: "USD", totalCurrentBalance: 50_000 })],
    })
    expect(s.accountsTotal).toBe(100)
    expect(s.totalLiabilities).toBe(0)
    expect(s.netWorth).toBe(100)
    expect(s.hasExcludedNonEur).toBe(true)
  })

  test("the 'excluded' flag is off when everything is EUR", () => {
    const s = summarize({ ...empty, accounts: [account()], crypto: [holding()], mortgages: [debt()] })
    expect(s.hasExcludedNonEur).toBe(false)
  })

  test("counts include excluded portfolios (the tile still says how many you have)", () => {
    expect(summarize({ ...empty, crypto: [holding({ currency: "USD" })] }).crypto.count).toBe(1)
  })
})

describe("summarize: loading state", () => {
  test("net worth is loading while any investment detail is loading", () => {
    expect(summarize({ ...empty, stocks: [holding({ loading: true })] }).netWorthLoading).toBe(true)
    expect(summarize({ ...empty, metals: [holding({ loading: true })] }).netWorthLoading).toBe(true)
    expect(summarize({ ...empty, crypto: [holding({ loading: true }), holding()] }).crypto.loading).toBe(true)
    expect(summarize({ ...empty, crypto: [holding()] }).netWorthLoading).toBe(false)
  })
})

describe("summarize: monthly cash flow", () => {
  const tx = (id: string, ind: "CRDT" | "DBIT", amount: string, transferPeerId: string | null = null) =>
    transaction({ id, creditDebitIndicator: ind, amount, transferPeerId })

  test("income, expenses and net", () => {
    const s = summarize({ ...empty, monthTransactions: [tx("1", "CRDT", "2000.00"), tx("2", "DBIT", "300.50"), tx("3", "DBIT", "99.50")] })
    expect(s.cashFlow).toEqual({ income: 2000, expenses: 400, net: 1600 })
  })

  test("transfers between own accounts are neither income nor expense", () => {
    const s = summarize({ ...empty, monthTransactions: [tx("1", "CRDT", "500.00", "peer"), tx("2", "DBIT", "500.00", "peer"), tx("3", "DBIT", "10.00")] })
    expect(s.cashFlow).toEqual({ income: 0, expenses: 10, net: -10 })
  })

  test("no transactions → zeros", () => {
    expect(summarize(empty).cashFlow).toEqual({ income: 0, expenses: 0, net: 0 })
  })
})

describe("labels", () => {
  test("unrealizedLabel: arrow by sign, absolute amount", () => {
    expect(unrealizedLabel({ total: 0, unrealizedPnL: 120, count: 1, loading: false }, fmt)).toBe("↑ €120.00 unrealized")
    expect(unrealizedLabel({ total: 0, unrealizedPnL: -45.5, count: 1, loading: false }, fmt)).toBe("↓ €45.50 unrealized")
  })
  test("unrealizedLabel: nothing while loading, with no portfolios, or at exactly zero", () => {
    expect(unrealizedLabel({ total: 0, unrealizedPnL: 10, count: 1, loading: true }, fmt)).toBeUndefined()
    expect(unrealizedLabel({ total: 0, unrealizedPnL: 10, count: 0, loading: false }, fmt)).toBeUndefined()
    expect(unrealizedLabel({ total: 0, unrealizedPnL: 0, count: 1, loading: false }, fmt)).toBeUndefined()
  })
  test("bankingLabel", () => {
    expect(bankingLabel([])).toBeUndefined()
    expect(bankingLabel([account({ type: "checking" })])).toBe("1 checking")
    expect(bankingLabel([account({ type: "savings" }), account({ id: "b", type: "checking" }), account({ id: "c", type: "checking" })])).toBe("1 savings · 2 checking")
  })
})

describe("toHoldings", () => {
  test("pairs portfolios with their details by position and picks the value per type", () => {
    const h = toHoldings(
      [portfolio({ currency: "EUR" }), portfolio({ id: "p2", currency: "USD" })],
      [{ data: { totalUnrealizedPnL: 5, v: 100 }, isLoading: false }, { data: undefined, isLoading: true }],
      (d) => d.v,
    )
    expect(h).toEqual([
      { currency: "EUR", value: 100, unrealizedPnL: 5, loading: false },
      { currency: "USD", value: null, unrealizedPnL: null, loading: true },
    ])
  })
  test("a missing detail entry is treated as loading-less and empty", () => {
    expect(toHoldings([portfolio()], [], () => 1)).toEqual([{ currency: "EUR", value: null, unrealizedPnL: null, loading: false }])
  })
})
