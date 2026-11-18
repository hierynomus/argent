export interface FifoResult {
  /** Remaining unconsumed units in the open position */
  balance: number
  /** FIFO average cost per unit of the open position, in base currency */
  avgCostBasis: number
  /** Total base-currency cost of the open position */
  totalCost: number
  /** Realized P&L from all sales matched so far, in base currency */
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

/**
 * FIFO cost-basis computation for a single asset symbol within a portfolio.
 *
 * Handles three trade types:
 *   Buy  = fromSymbol === baseCurrency, toSymbol === symbol
 *   Sell = fromSymbol === symbol, toSymbol === baseCurrency
 *   Swap-in  = fromSymbol !== baseCurrency, toSymbol === symbol  (cost from baseCurrencyAmount)
 *   Swap-out = fromSymbol === symbol, toSymbol !== baseCurrency  (proceeds from baseCurrencyAmount)
 *
 * All amounts are strings (Drizzle numeric columns) and parsed here.
 */
export function computeFifo(
  trades: Trade[],
  symbol: string,
  baseCurrency: string,
): FifoResult {
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))

  // Build FIFO buy queue — includes regular buys and swap-ins
  const buyQueue = sorted
    .filter((t) => t.toSymbol === symbol && t.fromSymbol !== symbol)
    .map((t) => {
      const qty = parseFloat(t.toAmount)
      let costPerUnit: number
      if (t.fromSymbol === baseCurrency) {
        // Regular buy: EUR paid ÷ units received
        costPerUnit = parseFloat(t.fromAmount) / qty
      } else {
        // Swap-in: baseCurrencyAmount is the transferred cost basis
        costPerUnit = t.baseCurrencyAmount != null ? parseFloat(t.baseCurrencyAmount) / qty : 0
      }
      return { remainingQty: qty, costPerUnit }
    })

  // Sells — includes regular sells and swap-outs
  const sells = sorted.filter((t) => t.fromSymbol === symbol && t.toSymbol !== symbol)

  let realizedPnL = 0

  for (const sell of sells) {
    let remaining = parseFloat(sell.fromAmount)
    let salePricePerUnit: number
    if (sell.toSymbol === baseCurrency) {
      // Regular sell
      salePricePerUnit = parseFloat(sell.toAmount) / parseFloat(sell.fromAmount)
    } else {
      // Swap-out: baseCurrencyAmount = cost basis transferred (zero realized P&L)
      salePricePerUnit = sell.baseCurrencyAmount != null
        ? parseFloat(sell.baseCurrencyAmount) / parseFloat(sell.fromAmount)
        : 0
    }

    while (remaining > 1e-10 && buyQueue.length > 0) {
      const lot = buyQueue[0]
      const consumed = Math.min(remaining, lot.remainingQty)
      realizedPnL += consumed * (salePricePerUnit - lot.costPerUnit)
      lot.remainingQty -= consumed
      remaining -= consumed
      if (lot.remainingQty < 1e-10) buyQueue.shift()
    }
  }

  const balance = buyQueue.reduce((s, l) => s + l.remainingQty, 0)
  const totalCost = buyQueue.reduce((s, l) => s + l.remainingQty * l.costPerUnit, 0)
  const avgCostBasis = balance > 1e-10 ? totalCost / balance : 0

  return { balance, avgCostBasis, totalCost, realizedPnL }
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
