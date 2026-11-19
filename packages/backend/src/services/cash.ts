import { Decimal, cents } from "./money"

interface CashPortfolio {
  currency: string
  openingCash: string
  /** events dated on or after this day are added to `openingCash`; null = all of them */
  openingCashDate: string | null
}
interface Movement { movementDate: string; type: string; amount: string }
interface Trade { tradeDate: string; fromSymbol: string; fromAmount: string; toSymbol: string; toAmount: string }
interface Dividend { paymentDate: string; amount: string }

/** +1 for money coming into the account, -1 for money leaving it. */
const DIRECTION: Record<string, 1 | -1> = { deposit: 1, interest: 1, withdrawal: -1, fee: -1 }

/**
 * The cash in the account behind a crypto/stocks portfolio, in whole cents.
 *
 * It is not entered but derived, like a bank account's balance: the opening cash, plus deposits and interest,
 * minus withdrawals and fees, minus what buys cost and plus what sells brought in (trades record the amount
 * in the portfolio's currency), plus dividends. Swaps between coins never touch the cash. Everything dated
 * before the opening cash date is already inside the opening amount. The balance may be negative: the history
 * entered is not necessarily complete, so it is shown rather than refused.
 */
export function computeCash(portfolio: CashPortfolio, movements: Movement[], trades: Trade[], dividends: Dividend[] = []): number {
  const counts = (date: string) => !portfolio.openingCashDate || date >= portfolio.openingCashDate
  let cash = new Decimal(portfolio.openingCash)
  for (const m of movements) if (counts(m.movementDate)) cash = cash.plus(new Decimal(m.amount).times(DIRECTION[m.type] ?? 0))
  for (const t of trades) {
    if (!counts(t.tradeDate)) continue
    if (t.fromSymbol === portfolio.currency && t.toSymbol !== portfolio.currency) cash = cash.minus(t.fromAmount) // a buy
    else if (t.toSymbol === portfolio.currency && t.fromSymbol !== portfolio.currency) cash = cash.plus(t.toAmount) // a sell
  }
  for (const d of dividends) if (counts(d.paymentDate)) cash = cash.plus(d.amount)
  return cents(cash)
}
