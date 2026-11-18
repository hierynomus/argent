import { computeFifo } from "./fifo"
import { Decimal, cents, isOpenQuantity } from "./money"

/** One asset of a portfolio: what is held, what it cost, what it is worth now and what it earned. */
export interface Position {
  symbol: string
  name: string
  assetForm: string | null
  balance: number
  /** cost per unit of the open position (not rounded: a coin can cost 0.000000005) */
  avgCostBasis: number
  totalCost: number
  realizedPnL: number
  currentPrice: number | null
  currentValue: number | null
  unrealizedPnL: number | null
}

interface TradeLike {
  tradeDate: string
  fromSymbol: string
  fromAmount: string
  toSymbol: string
  toAmount: string
  baseCurrencyAmount?: string | null
}

/**
 * The positions of a crypto or stock portfolio, shared by both routes: FIFO cost basis per symbol, valued at
 * `prices` (null = no price). Money amounts are whole cents; open positions come first, then by symbol.
 * `extra` adds fields of its own to each position (stocks: dividends).
 */
export function buildPositions<Extra extends object = Record<never, never>>(
  trades: TradeLike[],
  symbols: string[],
  assets: Array<{ symbol: string; name: string | null; assetForm: string | null }>,
  prices: Record<string, number | null | undefined>,
  currency: string,
  extra?: (symbol: string) => Extra,
): Array<Position & Extra> {
  return symbols
    .map((symbol) => {
      const fifo = computeFifo(trades, symbol, currency)
      const asset = assets.find((a) => a.symbol === symbol)
      const currentPrice = prices[symbol] ?? null
      const currentValue = currentPrice !== null ? cents(new Decimal(fifo.balance).times(currentPrice)) : null
      return {
        symbol,
        name: asset?.name ?? symbol,
        assetForm: asset?.assetForm ?? null,
        balance: fifo.balance,
        avgCostBasis: fifo.avgCostBasis,
        totalCost: fifo.totalCost,
        realizedPnL: fifo.realizedPnL,
        currentPrice,
        currentValue,
        unrealizedPnL: currentValue !== null ? cents(new Decimal(currentValue).minus(fifo.totalCost)) : null,
        ...(extra ? extra(symbol) : ({} as Extra)),
      }
    })
    .sort((a, b) => {
      if (isOpenQuantity(a.balance) && !isOpenQuantity(b.balance)) return -1
      if (isOpenQuantity(b.balance) && !isOpenQuantity(a.balance)) return 1
      return a.symbol.localeCompare(b.symbol)
    })
}

const total = (values: number[]) => cents(values.reduce((s, v) => s.plus(v), new Decimal(0)))

/**
 * The totals of a portfolio. The current value is only known when every open position has a price (a
 * partial sum would understate the portfolio), and then so is the unrealized P&L.
 */
export function summarizePositions(positions: Position[]) {
  const open = positions.filter((p) => isOpenQuantity(p.balance))
  const totalOpenCost = total(positions.map((p) => p.totalCost))
  const allHavePrices = open.length > 0 && open.every((p) => p.currentValue !== null)
  const totalCurrentValue = allHavePrices ? total(positions.map((p) => p.currentValue ?? 0)) : null
  return {
    totalOpenCost,
    totalCurrentValue,
    totalRealizedPnL: total(positions.map((p) => p.realizedPnL)),
    totalUnrealizedPnL: totalCurrentValue !== null ? cents(new Decimal(totalCurrentValue).minus(totalOpenCost)) : null,
  }
}
