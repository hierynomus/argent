import { useSubscriptionTransactions } from "../../api"
import { fmtBalance } from "../../lib/format"

/** The payments a subscription was detected from. Loads when first shown. */
export function LinkedTransactions({ subscriptionId, emptyText, dividerClass }: { subscriptionId: string; emptyText: string; dividerClass: string }) {
  const { data: txs, isLoading } = useSubscriptionTransactions(subscriptionId, true)

  if (isLoading) return <p className="text-gray-400 dark:text-gray-500 text-xs">Loading transactions…</p>
  if (!txs || txs.length === 0) return <p className="text-gray-400 dark:text-gray-500 text-xs">{emptyText}</p>

  return (
    <div className={`divide-y ${dividerClass}`}>
      {txs.map((tx) => (
        <div key={tx.id} className="flex items-center justify-between py-1.5 text-xs">
          <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{tx.bookingDate}</span>
          <span className="text-gray-600 dark:text-gray-400 flex-1 truncate px-3">{tx.description ?? "—"}</span>
          <span className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">{fmtBalance(tx.amount, tx.currency, "nl-NL")}</span>
        </div>
      ))}
    </div>
  )
}
