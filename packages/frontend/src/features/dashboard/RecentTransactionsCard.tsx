import { Link } from "react-router-dom"
import { fmtCur, fmtDayMonth } from "../../lib/format"
import { Skeleton } from "./Skeleton"

// ─── Recent Transactions Card ─────────────────────────────────────────────────

export function RecentTransactionsCard({
  transactions,
  loading,
}: {
  transactions: Array<{
    id: string
    bookingDate: string
    amount: string
    currency: string
    creditDebitIndicator: string
    counterpartyName: string | null
    description: string | null
    transferPeerId: string | null
  }>
  loading: boolean
}) {
  // Exclude internal transfers
  const visible = transactions.filter(t => !t.transferPeerId)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Transactions</p>
        <Link
          to="/overview"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
        >
          View all →
        </Link>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No recent transactions.</p>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
          {visible.map((tx) => {
            const isCredit = tx.creditDebitIndicator === "CRDT"
            const label = tx.counterpartyName ?? tx.description ?? "—"
            return (
              <div key={tx.id} className="flex items-center gap-4 py-2.5">
                <span className="text-xs text-gray-400 dark:text-gray-500 w-12 shrink-0 tabular-nums">
                  {fmtDayMonth(tx.bookingDate)}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                  {label}
                </span>
                <span className={`text-sm font-semibold tabular-nums shrink-0 ${isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {isCredit ? "+" : "−"}{fmtCur(parseFloat(tx.amount), tx.currency)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
