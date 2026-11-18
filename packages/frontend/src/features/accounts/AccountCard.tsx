import { Link } from "react-router-dom"
import type { Account } from "@argent/shared"
import { useRecentTransactions } from "../../api"
import { fmtAmount, fmtBalance, fmtDate } from "../../lib/format"

/** One bank account: balance header (links to the filtered Overview) plus its 10 latest transactions. */
export function AccountCard({ account }: { account: Account }) {
  const { data } = useRecentTransactions(10, account.id)
  const txs = data?.data ?? []

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <Link
        to={`/overview?account=${account.id}`}
        className="block px-6 py-5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{account.iban}</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{account.name ?? account.iban}</p>
            {account.openingBalanceDate && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">since {fmtDate(account.openingBalanceDate)}</p>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtBalance(account.balance, account.currency)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{account.currency}</p>
          </div>
        </div>
      </Link>

      <div className="px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Recent transactions</p>
        {txs.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {txs.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-2 pr-4 text-gray-400 dark:text-gray-500 whitespace-nowrap w-28">{fmtDate(tx.bookingDate)}</td>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 min-w-0 truncate max-w-0 w-full">
                    {tx.counterpartyName ?? tx.description ?? "—"}
                  </td>
                  <td
                    className={`py-2 text-right whitespace-nowrap font-medium tabular-nums ${
                      tx.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {fmtAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
