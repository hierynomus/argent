import { Decimal, cents } from "./money"
import { computeCash } from "./cash"
import { computeFifo, investmentSymbols } from "./fifo"
import { currentValueOf } from "./property"
import { latestStatementOf, netWorthValueOf, planState } from "./pension"
import { addDays } from "../lib/dates"
import type { SchedulePoint } from "./amortization"

/** Everything dated that makes up net worth, already reduced to plain values (EUR only) and what the user may see. */
export interface NetWorthData {
  accounts: Array<{ openingBalance: string; openingBalanceDate: string | null; txs: Array<{ date: string; net: string }> }>
  /** crypto and stocks portfolios with their cash account */
  trading: Array<{
    currency: string
    openingCash: string
    openingCashDate: string | null
    trades: Array<{ tradeDate: string; fromSymbol: string; fromAmount: string; toSymbol: string; toAmount: string; baseCurrencyAmount?: string | null }>
    movements: Array<{ movementDate: string; type: string; amount: string }>
    dividends: Array<{ paymentDate: string; amount: string }>
  }>
  metals: Array<{
    lots: Array<{ id: string; purchaseDate: string; quantity: number; pricePerPiece: string }>
    sales: Array<{ lotId: string; saleDate: string; quantitySold: number }>
  }>
  properties: Array<{ valuations: Array<{ valuationDate: string; value: string }>; purchase: { price: string | null; date: string | null } }>
  pensions: Array<{ countInNetWorth: boolean; status: string; closedOn: string | null; statements: Array<{ statementDate: string; capital: string | null }> }>
  /** per mortgage/loan: its balance after every installment (see `balanceSchedule`) */
  debts: SchedulePoint[][]
}

export interface NetWorthPoint {
  date: string
  banking: number
  /** crypto, stocks and metals at what they cost (still held) plus the cash in their accounts: there is no price history */
  investments: number
  property: number
  pensions: number
  debts: number
  netWorth: number
}

const sum = (values: Array<Decimal.Value>) => cents(values.reduce<Decimal>((s, v) => s.plus(v), new Decimal(0)))

function bankingAt(data: NetWorthData, date: string): number {
  return sum(
    data.accounts.map((a) => {
      if (a.openingBalanceDate && date < a.openingBalanceDate) return 0 // the balance counts from its opening date
      const since = a.openingBalanceDate
      return sum([a.openingBalance, ...a.txs.filter((t) => t.date <= date && (!since || t.date >= since)).map((t) => t.net)])
    }),
  )
}

function investmentsAt(data: NetWorthData, date: string): number {
  const trading = data.trading.map((p) => {
    const trades = p.trades.filter((t) => t.tradeDate <= date)
    const cost = sum(investmentSymbols(trades, p.currency).map((s) => computeFifo(trades, s, p.currency).totalCost))
    const cash = computeCash(
      { currency: p.currency, openingCash: p.openingCash, openingCashDate: p.openingCashDate },
      p.movements.filter((m) => m.movementDate <= date),
      trades,
      p.dividends.filter((d) => d.paymentDate <= date),
    )
    return sum([cost, cash])
  })
  const metals = data.metals.map((p) => {
    const price = new Map(p.lots.map((l) => [l.id, new Decimal(l.pricePerPiece)]))
    const bought = p.lots.filter((l) => l.purchaseDate <= date).map((l) => price.get(l.id)!.times(l.quantity))
    const sold = p.sales.filter((s) => s.saleDate <= date).map((s) => (price.get(s.lotId) ?? new Decimal(0)).times(s.quantitySold).negated())
    return sum([...bought, ...sold])
  })
  return sum([...trading, ...metals])
}

const propertyAt = (data: NetWorthData, date: string) => sum(data.properties.map((p) => currentValueOf(p.valuations, p.purchase, date).value ?? 0))

function pensionsAt(data: NetWorthData, date: string): number {
  return sum(
    data.pensions.map((p) => {
      const capital = latestStatementOf(p.statements.map((s) => ({ ...s })), date)?.capital
      return netWorthValueOf({ countInNetWorth: p.countInNetWorth, state: planState(p, date) }, capital == null ? null : parseFloat(capital))
    }),
  )
}

function debtsAt(data: NetWorthData, date: string): number {
  return sum(
    data.debts.map((points) => {
      let balance = 0 // before its first installment the debt did not exist
      for (const p of points) {
        if (p.date > date) break
        balance = p.balance
      }
      return balance
    }),
  )
}

/** Net worth on one day, split into what it is made of. Debts are subtracted. */
export function netWorthAt(data: NetWorthData, date: string): NetWorthPoint {
  const banking = bankingAt(data, date)
  const investments = investmentsAt(data, date)
  const property = propertyAt(data, date)
  const pensions = pensionsAt(data, date)
  const debts = debtsAt(data, date)
  return { date, banking, investments, property, pensions, debts, netWorth: sum([banking, investments, property, pensions, new Decimal(debts).negated()]) }
}

/** The earliest day anything dated happened, or null when there is nothing at all. */
export function firstDayOf(data: NetWorthData): string | null {
  const days: string[] = []
  for (const a of data.accounts) days.push(...(a.openingBalanceDate ? [a.openingBalanceDate] : a.txs.map((t) => t.date)))
  for (const p of data.trading) days.push(...p.trades.map((t) => t.tradeDate), ...p.movements.map((m) => m.movementDate), ...(p.openingCashDate ? [p.openingCashDate] : []))
  for (const p of data.metals) days.push(...p.lots.map((l) => l.purchaseDate))
  for (const p of data.properties) days.push(...p.valuations.map((v) => v.valuationDate), ...(p.purchase.date ? [p.purchase.date] : []))
  for (const p of data.pensions) days.push(...p.statements.map((s) => s.statementDate))
  for (const d of data.debts) if (d[0]) days.push(d[0].date)
  return days.sort()[0] ?? null
}

const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/**
 * The days to compute: weekly over the last 400 days (so short ranges still have a line), month-ends before
 * that, the first day with data, and today.
 */
export function sampleDays(first: string, today: string): string[] {
  const days = new Set<string>([first, today])
  const recent = addDays(today, -400)
  for (let d = today; d >= first && d >= recent; d = addDays(d, -7)) days.add(d)
  for (let d = monthEnd(first); d < recent; d = monthEnd(addDays(d, 1))) if (d >= first) days.add(d)
  return [...days].filter((d) => d >= first && d <= today).sort()
}

/** Net worth over time up to `today` (empty without any data). Investments are valued at cost: see `NetWorthPoint`. */
export function netWorthHistory(data: NetWorthData, today: string): NetWorthPoint[] {
  const first = firstDayOf(data)
  if (!first || first > today) return []
  return sampleDays(first, today).map((d) => netWorthAt(data, d))
}
