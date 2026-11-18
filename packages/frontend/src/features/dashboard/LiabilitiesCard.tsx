import { fmtCur } from "../../lib/format"

// ─── Liabilities Card ─────────────────────────────────────────────────────────

export function LiabilitiesCard({
  mortgageBalance,
  mortgageMonthly,
  mortgageCount,
  loanBalance,
  loanMonthly,
  loanCount,
}: {
  mortgageBalance: number
  mortgageMonthly: number
  mortgageCount: number
  loanBalance: number
  loanMonthly: number
  loanCount: number
}) {
  const totalBalance = mortgageBalance + loanBalance
  const totalMonthly = mortgageMonthly + loanMonthly
  const hasAny = mortgageCount > 0 || loanCount > 0

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Liabilities</p>
      {!hasAny ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No mortgages or loans recorded.</p>
      ) : (
        <div className="space-y-3">
          {mortgageCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Mortgages
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({mortgageCount})</span>
              </span>
              <div className="text-right tabular-nums">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtCur(mortgageBalance)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{fmtCur(mortgageMonthly)}/mo</span>
              </div>
            </div>
          )}
          {loanCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Loans
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({loanCount})</span>
              </span>
              <div className="text-right tabular-nums">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtCur(loanBalance)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{fmtCur(loanMonthly)}/mo</span>
              </div>
            </div>
          )}
          {mortgageCount > 0 && loanCount > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total</span>
              <div className="text-right tabular-nums">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCur(totalBalance)}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">{fmtCur(totalMonthly)}/mo</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
