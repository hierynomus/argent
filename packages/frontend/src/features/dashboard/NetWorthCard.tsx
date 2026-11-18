import { fmtCur } from "../../lib/format"
import { Skeleton } from "./Skeleton"

// ─── Net Worth Hero ───────────────────────────────────────────────────────────

export function NetWorthCard({
  netWorth,
  totalAssets,
  totalLiabilities,
  loading,
  hasNonEurAssets,
}: {
  netWorth: number
  totalAssets: number
  totalLiabilities: number
  loading: boolean
  hasNonEurAssets: boolean
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-8 py-7">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Net Worth
      </p>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          {loading ? (
            <Skeleton className="h-12 w-48" />
          ) : (
            <p className={`text-5xl font-bold tracking-tight ${netWorth >= 0 ? "text-gray-900 dark:text-gray-100" : "text-red-600 dark:text-red-400"}`}>
              {fmtCur(netWorth)}
            </p>
          )}
        </div>
        <div className="flex gap-6 pb-1 text-sm text-gray-500 dark:text-gray-400">
          <div>
            <span className="text-gray-400 dark:text-gray-500 mr-1.5">Assets</span>
            {loading ? <Skeleton className="inline-block h-4 w-24 align-middle" /> : (
              <span className="font-semibold text-gray-700 dark:text-gray-300">{fmtCur(totalAssets)}</span>
            )}
          </div>
          <div>
            <span className="text-gray-400 dark:text-gray-500 mr-1.5">Liabilities</span>
            {loading ? <Skeleton className="inline-block h-4 w-24 align-middle" /> : (
              <span className="font-semibold text-gray-700 dark:text-gray-300">{fmtCur(totalLiabilities)}</span>
            )}
          </div>
        </div>
      </div>
      {hasNonEurAssets && !loading && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          * Non-EUR portfolios are excluded from this total.
        </p>
      )}
    </div>
  )
}
