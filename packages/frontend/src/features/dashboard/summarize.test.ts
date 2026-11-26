import { describe, expect, test } from "vitest"
import { account, debt, equityPlan, pensionPlan, portfolio, property } from "../../../test/fixtures"
import { assetMix, bankingLabel, summarize, toHoldings, unrealizedLabel, type DashboardInput, type Holding } from "./summarize"

const empty: DashboardInput = { accounts: [], mortgages: [], loans: [], crypto: [], metals: [], stocks: [] }
const holding = (over: Partial<Holding> = {}): Holding => ({ currency: "EUR", value: 1000, unrealizedPnL: 100, cash: 0, loading: false, ...over })
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
      { currency: "EUR", value: 100, unrealizedPnL: 5, cash: 0, loading: false },
      { currency: "USD", value: null, unrealizedPnL: null, cash: 0, loading: true },
    ])
  })
  test("a missing detail entry is treated as loading-less and empty", () => {
    expect(toHoldings([portfolio()], [], () => 1)).toEqual([{ currency: "EUR", value: null, unrealizedPnL: null, cash: 0, loading: false }])
  })
})

describe("summarize: property", () => {
  test("a property counts as an asset at its current value; the mortgage stays a liability, so a house with equity turns net worth positive", () => {
    // the user's situation: a 520k house with a mortgage that still owes 300k, and nothing else
    const s = summarize({ ...empty, properties: [property({ currentValue: 520_000, debt: 300_000, equity: 220_000 })], mortgages: [debt({ totalCurrentBalance: 300_000 })] })
    expect(s.totalAssets).toBe(520_000)
    expect(s.totalLiabilities).toBe(300_000)
    expect(s.netWorth).toBe(220_000)
    expect(s.properties).toEqual({ value: 520_000, debt: 300_000, equity: 220_000, count: 1, loading: false })
  })

  test("without the property the same mortgage makes net worth negative (the problem being solved)", () => {
    expect(summarize({ ...empty, mortgages: [debt({ totalCurrentBalance: 300_000 })] }).netWorth).toBe(-300_000)
  })

  test("several properties add up; one without a valuation or purchase price counts as 0", () => {
    const s = summarize({ ...empty, properties: [property({ currentValue: 500_000, debt: 100_000 }), property({ id: "p2", currentValue: null, debt: 0, equity: null }), property({ id: "p3", currentValue: 20_000, debt: 5_000 })] })
    expect(s.properties).toMatchObject({ value: 520_000, debt: 105_000, equity: 415_000, count: 3 })
  })

  test("a property in another currency is left out, and the page says so", () => {
    const s = summarize({ ...empty, properties: [property({ currency: "USD", currentValue: 999_999 })] })
    expect(s.properties.value).toBe(0)
    expect(s.properties.count).toBe(1)
    expect(s.totalAssets).toBe(0)
    expect(s.hasExcludedNonEur).toBe(true)
  })

  test("net worth is still loading while the properties are", () => {
    expect(summarize({ ...empty, propertiesLoading: true }).netWorthLoading).toBe(true)
    expect(summarize({ ...empty, propertiesLoading: false }).netWorthLoading).toBe(false)
  })

  test("callers that do not pass properties get zeros", () => {
    expect(summarize(empty).properties).toEqual({ value: 0, debt: 0, equity: 0, count: 0, loading: false })
  })
})

describe("summarize: stock options", () => {
  test("only the vested value counts in net worth; still-vesting and on-exit value are reported but not counted", () => {
    const s = summarize({ ...empty, equity: [equityPlan()] })
    expect(s.equity).toEqual({ vestedValue: 24_000, unvestedValue: 24_000, onExitValue: 10_000, count: 1, loading: false })
    expect(s.totalAssets).toBe(24_000)
    expect(s.netWorth).toBe(24_000)
  })

  test("plans add up; an unpriced plan counts as 0", () => {
    const unpriced = equityPlan({ id: "eq2", totals: { granted: 100, vested: 50, unvested: 50, onExit: 0, vestedValue: null, unvestedValue: null, onExitValue: null } })
    const s = summarize({ ...empty, equity: [equityPlan(), equityPlan({ id: "eq3" }), unpriced] })
    expect(s.equity).toMatchObject({ vestedValue: 48_000, onExitValue: 20_000, count: 3 })
  })

  test("a plan in another currency is left out and flagged", () => {
    const s = summarize({ ...empty, equity: [equityPlan({ currency: "USD" })] })
    expect(s.equity.vestedValue).toBe(0)
    expect(s.totalAssets).toBe(0)
    expect(s.hasExcludedNonEur).toBe(true)
  })

  test("it sits next to a house and a mortgage in one net worth", () => {
    const s = summarize({ ...empty, properties: [property({ currentValue: 520_000 })], mortgages: [debt({ totalCurrentBalance: 300_000 })], equity: [equityPlan()] })
    expect(s.netWorth).toBe(520_000 + 24_000 - 300_000)
  })

  test("net worth is loading while the plans are, and callers without equity get zeros", () => {
    expect(summarize({ ...empty, equityLoading: true }).netWorthLoading).toBe(true)
    expect(summarize(empty).equity).toEqual({ vestedValue: 0, unvestedValue: 0, onExitValue: 0, count: 0, loading: false })
  })
})

describe("summarize: cash in investment accounts", () => {
  const base = { accounts: [], mortgages: [], loans: [], crypto: [], metals: [], stocks: [] } as DashboardInput

  test("cash counts in net worth with the positions, also when a position has no price", () => {
    const s = summarize({ ...base, crypto: [holding({ value: null, unrealizedPnL: null, cash: 250 })], stocks: [holding({ value: 1000, cash: 100.1 }), holding({ value: 0, cash: 0.2 })] })
    expect(s.crypto.total).toBe(250)
    expect(s.stocks.total).toBe(1100.3)
    expect(s.totalAssets).toBe(1350.3)
  })

  test("cash in another currency is left out like the rest of that portfolio", () => {
    const s = summarize({ ...base, crypto: [holding({ currency: "USD", value: 500, cash: 999 })] })
    expect(s.crypto.total).toBe(0)
    expect(s.hasExcludedNonEur).toBe(true)
  })

  test("toHoldings reads the cash from the detail (metals have none)", () => {
    const withCash = toHoldings([{ currency: "EUR" }], [{ data: { totalUnrealizedPnL: null, cash: 75 } as any, isLoading: false }], () => 10)
    expect(withCash[0].cash).toBe(75)
    const metals = toHoldings([{ currency: "EUR" }], [{ data: { totalUnrealizedPnL: null } as any, isLoading: false }], () => 10)
    expect(metals[0].cash).toBe(0)
  })
})

describe("summarize: pensions", () => {
  test("the pot of an open plan that counts is an asset", () => {
    const s = summarize({ ...empty, pensions: [pensionPlan({ netWorthValue: 42_000 })] })
    expect(s.pensions).toEqual({ value: 42_000, count: 1, loading: false })
    expect(s.totalAssets).toBe(42_000)
    expect(s.netWorth).toBe(42_000)
  })

  test("rights, the state pension and closed plans add nothing (the plan says what counts)", () => {
    const s = summarize({
      ...empty,
      pensions: [pensionPlan({ id: "a", netWorthValue: 0, kind: "occupational_db", capital: null }), pensionPlan({ id: "b", netWorthValue: 0, state: "closed" }), pensionPlan({ id: "c", netWorthValue: 5_000 })],
    })
    expect(s.pensions).toMatchObject({ value: 5_000, count: 2 }) // closed ones are not counted as plans
  })

  test("a pension in another currency is left out, and the page says so", () => {
    const s = summarize({ ...empty, pensions: [pensionPlan({ currency: "USD", netWorthValue: 9_999 })] })
    expect(s.pensions.value).toBe(0)
    expect(s.hasExcludedNonEur).toBe(true)
  })
})

describe("assetMix", () => {
  test("splits the assets by class, largest first, with shares that add up to 100", () => {
    const mix = assetMix(summarize({
      ...empty,
      accounts: [account({ balance: "1000" })],
      stocks: [holding({ value: 2000, cash: 0 })],
      crypto: [holding({ value: 500 })],
    }))
    expect(mix.map((s) => s.key)).toEqual(["stocks", "banking", "crypto"])
    expect(mix.map((s) => s.value)).toEqual([2000, 1000, 500])
    expect(mix[0]!.percent).toBeCloseTo(57.14, 1)
    expect(mix.reduce((n, s) => n + s.percent, 0)).toBeCloseTo(100)
  })

  test("leaves out what is zero or negative: an overdrawn account is no negative piece of a bar", () => {
    const mix = assetMix(summarize({ ...empty, accounts: [account({ balance: "-50" })], metals: [holding({ value: 300 })] }))
    expect(mix.map((s) => s.key)).toEqual(["metals"])
  })

  test("nothing at all gives no slices", () => {
    expect(assetMix(summarize(empty))).toEqual([])
  })
})
