import type { Account } from "@argent/shared"
import { useAccounts } from "../../api"
import { AccountCard } from "./AccountCard"

/** The "Checking" and "Savings" screens: all accounts of one type as cards. */
export function AccountsByType({
  title,
  noun,
  emptyHint,
  matches,
}: {
  title: string
  /** lower-case plural used in the empty state, e.g. "checking accounts" */
  noun: string
  emptyHint: string
  matches: (account: Account) => boolean
}) {
  const { data: accounts = [], isLoading } = useAccounts()
  const shown = accounts.filter(matches)

  if (isLoading) return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading…</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
      {shown.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-6 py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No {noun} yet.</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">{emptyHint}</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {shown.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
