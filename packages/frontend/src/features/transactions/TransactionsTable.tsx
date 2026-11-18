import type { TransactionWithDetails } from "@argent/shared"
import { cx } from "../../components/ui"
import { CategoryChip } from "./CategoryChip"
import { formatAmount } from "./TransactionDetail"

const CHECKBOX = "w-4 h-4 accent-indigo-600 cursor-pointer"

/** The transaction list with row checkboxes (bulk actions) and click-to-open details. */
export function TransactionsTable({
  rows,
  openId,
  selectedIds,
  onOpen,
  onToggle,
  onToggleAll,
  onOpenSubscriptions,
}: {
  rows: TransactionWithDetails[]
  /** the row whose detail panel is open */
  openId: string | null
  selectedIds: ReadonlySet<string>
  onOpen: (tx: TransactionWithDetails) => void
  onToggle: (id: string) => void
  onToggleAll: () => void
  onOpenSubscriptions: () => void
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            <th className="px-4 py-3 w-10">
              <input type="checkbox" aria-label="Select all on this page" checked={allSelected} onChange={onToggleAll} className={CHECKBOX} />
            </th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Counterparty</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Label</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((tx) => (
            <tr
              key={tx.id}
              onClick={() => onOpen(tx)}
              className={cx(
                "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                openId === tx.id && "bg-indigo-50 dark:bg-indigo-950",
                selectedIds.has(tx.id) && "bg-indigo-50/60 dark:bg-indigo-950/40",
              )}
            >
              <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={`Select transaction ${tx.description ?? tx.id}`} checked={selectedIds.has(tx.id)} onChange={() => onToggle(tx.id)} className={CHECKBOX} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{tx.bookingDate}</td>
              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[120px] truncate">{tx.account.name ?? tx.account.iban}</td>
              <td className="px-4 py-3 max-w-[140px] truncate">
                {tx.transferPeer ? (
                  <span className="text-indigo-500 dark:text-indigo-400 text-xs font-medium">↔ {tx.transferPeer.account.name ?? tx.transferPeer.account.iban}</span>
                ) : (
                  <span className="text-gray-900 dark:text-gray-100">{tx.counterpartyName ?? <span className="text-gray-400 dark:text-gray-500">—</span>}</span>
                )}
              </td>
              <td className="px-4 py-3 max-w-[220px]">
                <div className="text-gray-600 dark:text-gray-400 truncate">{tx.description ?? <span className="text-gray-400 dark:text-gray-500">—</span>}</div>
                {tx.subscriptionId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenSubscriptions()
                    }}
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium leading-none"
                  >
                    ↻ subscription
                  </button>
                )}
              </td>
              <td
                className={cx(
                  "px-4 py-3 text-right font-mono font-medium whitespace-nowrap",
                  tx.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
                )}
              >
                {formatAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
              </td>
              <td className="px-4 py-3">
                <CategoryChip category={tx.category} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                No transactions found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
