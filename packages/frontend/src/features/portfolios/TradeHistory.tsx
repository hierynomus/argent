import type { CryptoTrade, StockTrade } from "@argent/shared"
import { Badge } from "../../components/ui"
import { Collapsible } from "./Collapsible"

type Trade = CryptoTrade | StockTrade

const BADGE = {
  Buy: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  Sell: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  Swap: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
} as const

/**
 * Collapsible, newest-first list of ledger entries. A trade is a Buy when paid in the portfolio
 * currency, a Sell when received in it, and otherwise a Swap (crypto only).
 */
export function TradeHistory({
  trades,
  currency,
  formatAmount,
  className,
}: {
  trades: Trade[]
  currency: string
  formatAmount: (n: number) => string
  className?: string
}) {
  if (trades.length === 0) return null
  return (
    <Collapsible title={`Trade history (${trades.length})`} className={className}>
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-right">From</th>
            <th className="px-4 py-2 text-right">To</th>
            <th className="px-4 py-2 text-left">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {[...trades].reverse().map((t) => {
            const kind = t.fromSymbol === currency ? "Buy" : t.toSymbol === currency ? "Sell" : "Swap"
            return (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{t.tradeDate}</td>
                <td className="px-4 py-2">
                  <Badge className={BADGE[kind]}>{kind}</Badge>
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  {formatAmount(parseFloat(t.fromAmount))} {t.fromSymbol}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                  {formatAmount(parseFloat(t.toAmount))} {t.toSymbol}
                </td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{t.notes ?? ""}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Collapsible>
  )
}
