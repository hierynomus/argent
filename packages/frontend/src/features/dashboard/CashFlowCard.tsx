import { fmtCur } from "../../lib/format"
import { Skeleton } from "./Skeleton"

// ─── Cash Flow Card ───────────────────────────────────────────────────────────

export function CashFlowCard({
  income,
  expenses,
  loading,
  monthLabel,
}: {
  income: number
  expenses: number
  loading: boolean
  monthLabel: string
}) {
  const net = income - expenses
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Cash Flow — {monthLabel}
      </p>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Income</span>
            <span className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">
              {fmtCur(income)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Expenses</span>
            <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {fmtCur(expenses)}
            </span>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Net</span>
            <span className={`text-sm font-bold tabular-nums ${net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {net >= 0 ? "+" : ""}{fmtCur(net)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
