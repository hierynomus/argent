import { Decimal, cents } from "./money"

export interface FifoResult {
  /** Remaining unconsumed units in the open position */
  balance: number
  /** FIFO average cost per unit of the open position, in base currency (not rounded: a coin can cost 0.000000005) */
  avgCostBasis: number
  /** Total base-currency cost of the open position, in whole cents */
  totalCost: number
  /** Realized P&L from all sales matched so far, in base currency, in whole cents */
  realizedPnL: number
}

interface Trade {
  tradeDate: string
  fromSymbol: string
  fromAmount: string
  toSymbol: string
  toAmount: string
  /** For swaps: the base-currency value of the trade (auto-computed on insert) */
  baseCurrencyAmount?: string | null
}

/** A purchase not yet fully sold: what is left of it and what that remainder cost, in total (never per unit). */
interface Lot {
  quantity: Decimal
  cost: Decimal
}

/**
 * FIFO cost-basis computation for a single asset symbol within a portfolio.
 *
 * Handles three trade types:
 *   Buy  = fromSymbol === baseCurrency, toSymbol === symbol
 *   Sell = fromSymbol === symbol, toSymbol === baseCurrency
 *   Swap-in  = fromSymbol !== baseCurrency, toSymbol === symbol  (cost from baseCurrencyAmount)
 *   Swap-out = fromSymbol === symbol, toSymbol !== baseCurrency  (proceeds from baseCurrencyAmount)
 *
 * All amounts are decimal strings (Drizzle numeric columns). The computation is exact: quantities and costs
 * are `Decimal`s, and a lot's cost is kept as a total and taken in proportion when it is partly sold, so
 * nothing is ever divided per unit and then multiplied back. Money results are rounded to cents at the end.
 */
export function computeFifo(trades: Trade[], symbol: string, baseCurrency: string): FifoResult {
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))

  // Build FIFO buy queue — includes regular buys and swap-ins
  const lots: Lot[] = sorted
    .filter((t) => t.toSymbol === symbol && t.fromSymbol !== symbol)
    .map((t) => ({
      quantity: new Decimal(t.toAmount),
      // regular buy: the base currency paid; swap-in: the cost basis transferred with the coins
      cost: t.fromSymbol === baseCurrency ? new Decimal(t.fromAmount) : new Decimal(t.baseCurrencyAmount ?? 0),
    }))

  // Sells — includes regular sells and swap-outs
  const sells = sorted.filter((t) => t.fromSymbol === symbol && t.toSymbol !== symbol)

  let realized = new Decimal(0)

  for (const sell of sells) {
    const sold = new Decimal(sell.fromAmount)
    if (sold.lte(0)) continue
    // what the sale brought in, in total: regular sell → the base currency received;
    // swap-out → the cost basis transferred (so a swap realises nothing)
    const proceeds = sell.toSymbol === baseCurrency ? new Decimal(sell.toAmount) : new Decimal(sell.baseCurrencyAmount ?? 0)

    let remaining = sold
    while (remaining.gt(0) && lots.length > 0) {
      const lot = lots[0]
      const consumed = Decimal.min(remaining, lot.quantity)
      // the share of the lot's cost and of the sale's proceeds that belong to the units consumed
      const costOfConsumed = lot.quantity.isZero() ? new Decimal(0) : lot.cost.times(consumed).div(lot.quantity)
      realized = realized.plus(proceeds.times(consumed).div(sold)).minus(costOfConsumed)
      lot.quantity = lot.quantity.minus(consumed)
      lot.cost = lot.cost.minus(costOfConsumed)
      remaining = remaining.minus(consumed)
      if (lot.quantity.isZero()) lots.shift()
    }
  }

  const balance = lots.reduce((s, l) => s.plus(l.quantity), new Decimal(0))
  const totalCost = lots.reduce((s, l) => s.plus(l.cost), new Decimal(0))
  const avgCostBasis = balance.gt(0) ? totalCost.div(balance) : new Decimal(0)

  return { balance: balance.toNumber(), avgCostBasis: avgCostBasis.toNumber(), totalCost: cents(totalCost), realizedPnL: cents(realized) }
}

/** Returns all unique investment symbols in a trade list (non-baseCurrency symbols) */
export function investmentSymbols(trades: Trade[], baseCurrency: string): string[] {
  const syms = new Set<string>()
  for (const t of trades) {
    if (t.fromSymbol !== baseCurrency) syms.add(t.fromSymbol)
    if (t.toSymbol !== baseCurrency) syms.add(t.toSymbol)
  }
  return Array.from(syms)
}
