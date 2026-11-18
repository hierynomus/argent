import type { AssetPosition, StockPosition } from "@argent/shared"
import { fmtSymbolCur, pnlColor, pnlFmt } from "../../lib/format"

const Dash = () => <span className="text-gray-300 dark:text-gray-600">—</span>

type Position = AssetPosition | StockPosition

/**
 * The positions table of a crypto or stock portfolio: one row per symbol with cost basis,
 * live value and P&L. `—` marks values that need a live price we don't have.
 */
export function PositionsTable({
  positions,
  currency,
  balanceHeader,
  formatBalance,
  showDividends = false,
  minWidth,
}: {
  positions: Position[]
  currency: string
  balanceHeader: string
  formatBalance: (n: number) => string
  showDividends?: boolean
  minWidth: string
}) {
  const columns = showDividends ? 9 : 8
  const th = (label: string, align: "left" | "right" = "right") => (
    <th className={`px-4 py-3 text-${align}`}>{label}</th>
  )
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 overflow-x-auto">
      <table className={`w-full text-sm ${minWidth}`}>
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            {th("Symbol", "left")}
            {th("Name", "left")}
            {th(balanceHeader)}
            {th("Avg cost")}
            {th("Current")}
            {th("Value")}
            {th("Unrealized")}
            {th("Realized")}
            {showDividends && th("Dividends")}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {positions.length === 0 && (
            <tr>
              <td colSpan={columns} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                No positions yet. Record a buy trade below.
              </td>
            </tr>
          )}
          {positions.map((pos) => (
            <tr key={pos.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td className="px-4 py-3 font-mono font-semibold text-indigo-700 dark:text-indigo-300">{pos.symbol}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{pos.name}</td>
              <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">{formatBalance(pos.balance)}</td>
              <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmtSymbolCur(pos.avgCostBasis, currency)}</td>
              <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                {pos.currentPrice != null ? fmtSymbolCur(pos.currentPrice, currency) : <Dash />}
              </td>
              <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
                {pos.currentValueEur != null ? fmtSymbolCur(pos.currentValueEur, currency) : <Dash />}
              </td>
              <td className={`px-4 py-3 text-right font-mono ${pos.unrealizedPnL != null ? pnlColor(pos.unrealizedPnL) : "text-gray-300 dark:text-gray-600"}`}>
                {pos.unrealizedPnL != null ? pnlFmt(pos.unrealizedPnL, currency) : "—"}
              </td>
              <td className={`px-4 py-3 text-right font-mono ${pnlColor(pos.realizedPnL)}`}>{pnlFmt(pos.realizedPnL, currency)}</td>
              {showDividends && (
                <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                  {"totalDividends" in pos && pos.totalDividends > 0 ? fmtSymbolCur(pos.totalDividends, currency) : <Dash />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
