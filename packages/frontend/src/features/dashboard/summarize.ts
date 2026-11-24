import { sumCents } from "../../lib/money"
import type { Account, EquityPlanWithDetails, PensionPlanWithDetails, PortfolioWithAccess, PropertyWithDetails, TransactionWithDetails } from "@argent/shared"
import type { Debt } from "../../api"

/** An investment portfolio reduced to what the dashboard needs (its value is positions + cash). `null` = no value yet (still loading, or no live price). */
export interface Holding {
  currency: string
  value: number | null
  unrealizedPnL: number | null
  /** cash in the account behind the portfolio (crypto/stocks); counts even when a position has no price */
  cash: number
  loading: boolean
}

/**
 * Pairs each portfolio in a list with its (possibly still loading) detail query. `value` picks the
 * portfolio's current value out of its detail, since the field differs per type.
 */
export function toHoldings<D extends { totalUnrealizedPnL: number | null }>(
  portfolios: Array<Pick<PortfolioWithAccess, "currency">>,
  details: Array<{ data?: D; isLoading: boolean }>,
  value: (detail: D) => number | null,
): Holding[] {
  return portfolios.map((p, i) => {
    const d = details[i]?.data
    return { currency: p.currency, value: d ? value(d) : null, unrealizedPnL: d?.totalUnrealizedPnL ?? null, cash: (d as { cash?: number } | undefined)?.cash ?? 0, loading: details[i]?.isLoading ?? false }
  })
}

export interface DashboardInput {
  accounts: Account[]
  mortgages: Debt[]
  loans: Debt[]
  crypto: Holding[]
  metals: Holding[]
  stocks: Holding[]
  /** this month's transactions */
  monthTransactions: TransactionWithDetails[]
  /** houses, cars, …: counted at their latest valuation */
  properties?: PropertyWithDetails[]
  propertiesLoading?: boolean
  /** stock options: the vested value counts, the rest is only shown */
  equity?: EquityPlanWithDetails[]
  equityLoading?: boolean
  /** pension plans: the pot of an open plan that counts adds to net worth; rights and state pension are income only */
  pensions?: PensionPlanWithDetails[]
  pensionsLoading?: boolean
}

export interface AssetClassSummary {
  /** value of the EUR portfolios only */
  total: number
  /** unrealized P&L of the EUR portfolios only */
  unrealizedPnL: number
  count: number
  loading: boolean
}

export interface DashboardSummary {
  accountsTotal: number
  crypto: AssetClassSummary
  metals: AssetClassSummary
  stocks: AssetClassSummary
  /** EUR properties at their current value; `equity` is value minus what is owed on them (their linked mortgages/loans) */
  properties: { value: number; debt: number; equity: number; count: number; loading: boolean }
  /** EUR option plans: `vestedValue` counts in net worth; `unvestedValue` (still vesting) and `onExitValue` do not */
  equity: { vestedValue: number; unvestedValue: number; onExitValue: number; count: number; loading: boolean }
  /** EUR pensions: `value` is what counts in net worth (pots), `count` the plans that are not closed */
  pensions: { value: number; count: number; loading: boolean }
  mortgages: { balance: number; monthly: number; count: number }
  loans: { balance: number; monthly: number; count: number }
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  netWorthLoading: boolean
  /** true when something was left out because it is not in EUR (the UI says so) */
  hasExcludedNonEur: boolean
  cashFlow: { income: number; expenses: number; net: number }
}

const EUR = "EUR"
const sum = <T,>(items: T[], f: (item: T) => number) => sumCents(items.map(f))

function summarizeHoldings(holdings: Holding[]): AssetClassSummary {
  const eur = holdings.filter((h) => h.currency === EUR)
  return {
    total: sum(eur, (h) => (h.value ?? 0) + (h.cash ?? 0)),
    unrealizedPnL: sum(eur, (h) => h.unrealizedPnL ?? 0),
    count: holdings.length,
    loading: holdings.some((h) => h.loading),
  }
}

const summarizeDebts = (debts: Debt[]) => {
  const eur = debts.filter((d) => d.currency === EUR)
  return { balance: sum(eur, (d) => d.totalCurrentBalance), monthly: sum(eur, (d) => d.totalMonthlyPayment), count: debts.length }
}

/**
 * Net worth and the numbers around it, in EUR.
 *
 * There are no exchange rates here, so only EUR accounts, portfolios and debts are counted — adding
 * dollars to euros would be wrong — and `hasExcludedNonEur` tells the UI to say that something was left out.
 * Internal transfers are not income or expenses.
 */
export function summarize(input: DashboardInput): DashboardSummary {
  const eurAccounts = input.accounts.filter((a) => a.currency === EUR)
  const accountsTotal = sum(eurAccounts, (a) => parseFloat(a.balance))
  const crypto = summarizeHoldings(input.crypto)
  const metals = summarizeHoldings(input.metals)
  const stocks = summarizeHoldings(input.stocks)
  const mortgages = summarizeDebts(input.mortgages)
  const loans = summarizeDebts(input.loans)

  const eurProperties = (input.properties ?? []).filter((p) => p.currency === EUR)
  const propertyValue = sum(eurProperties, (p) => p.currentValue ?? 0)
  const propertyDebt = sum(eurProperties, (p) => p.debt)
  const properties = { value: propertyValue, debt: propertyDebt, equity: propertyValue - propertyDebt, count: (input.properties ?? []).length, loading: input.propertiesLoading ?? false }

  const eurPlans = (input.equity ?? []).filter((p) => p.currency === EUR)
  const equity = {
    // an unpriced plan has no value yet (null) and counts as 0
    vestedValue: sum(eurPlans, (p) => p.totals.vestedValue ?? 0),
    unvestedValue: sum(eurPlans, (p) => p.totals.unvestedValue ?? 0),
    onExitValue: sum(eurPlans, (p) => p.totals.onExitValue ?? 0),
    count: (input.equity ?? []).length,
    loading: input.equityLoading ?? false,
  }

  const eurPensions = (input.pensions ?? []).filter((p) => p.currency === EUR)
  const pensions = { value: sum(eurPensions, (p) => p.netWorthValue), count: (input.pensions ?? []).filter((p) => p.state !== "closed").length, loading: input.pensionsLoading ?? false }

  // a linked mortgage stays in the liabilities below: the property is the asset on the other side of it
  const totalAssets = accountsTotal + crypto.total + metals.total + stocks.total + propertyValue + equity.vestedValue + pensions.value
  const totalLiabilities = mortgages.balance + loans.balance

  const anyNonEur = [...input.accounts, ...input.crypto, ...input.metals, ...input.stocks, ...input.mortgages, ...input.loans, ...(input.properties ?? []), ...(input.equity ?? []), ...(input.pensions ?? [])].some(
    (x) => x.currency !== EUR,
  )

  const flow = input.monthTransactions.filter((t) => !t.transferPeerId)
  const income = sum(flow.filter((t) => t.creditDebitIndicator === "CRDT"), (t) => parseFloat(t.amount))
  const expenses = sum(flow.filter((t) => t.creditDebitIndicator === "DBIT"), (t) => parseFloat(t.amount))

  return {
    accountsTotal,
    crypto,
    metals,
    stocks,
    properties,
    equity,
    pensions,
    mortgages,
    loans,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    netWorthLoading: crypto.loading || metals.loading || stocks.loading || properties.loading || equity.loading || pensions.loading,
    hasExcludedNonEur: anyNonEur,
    cashFlow: { income, expenses, net: income - expenses },
  }
}

/** "↑ €120.00 unrealized" / "↓ €45.00 unrealized"; undefined when there is nothing to show yet. */
export function unrealizedLabel(s: AssetClassSummary, fmt: (n: number) => string): string | undefined {
  if (s.loading || s.count === 0 || s.unrealizedPnL === 0) return undefined
  return `${s.unrealizedPnL >= 0 ? "↑" : "↓"} ${fmt(Math.abs(s.unrealizedPnL))} unrealized`
}

/** "1 savings · 2 checking · 1 cash"; undefined when there are no accounts. */
export function bankingLabel(accounts: Account[]): string | undefined {
  const savings = accounts.filter((a) => a.type === "savings").length
  const checking = accounts.filter((a) => a.type === "checking").length
  const cash = accounts.filter((a) => a.type === "cash").length
  return [savings > 0 ? `${savings} savings` : "", checking > 0 ? `${checking} checking` : "", cash > 0 ? `${cash} cash` : ""].filter(Boolean).join(" · ") || undefined
}
