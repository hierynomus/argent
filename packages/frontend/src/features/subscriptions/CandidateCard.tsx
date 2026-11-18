import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { Subscription } from "@argent/shared"
import { updateSubscription, useInvalidate } from "../../api"
import { Button, ErrorText } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import { LinkedTransactions } from "./LinkedTransactions"

/** A subscription the detector suggests. Confirm it to keep it, or dismiss it (it will not come back). */
export function CandidateCard({ sub }: { sub: Subscription }) {
  const invalidate = useInvalidate()
  const [expanded, setExpanded] = useState(false)

  const decide = useMutation({
    mutationFn: (status: "confirmed" | "dismissed") => updateSubscription(sub.id, { status }),
    onSuccess: () => invalidate.subscriptions(),
  })

  const displayName = sub.name ?? sub.counterpartyName ?? sub.counterpartyIban

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
          <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub.counterpartyIban}</div>
        </div>

        <div className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">{fmtBalance(sub.medianAmount, sub.currency, "nl-NL")}</div>

        {sub.intervalLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800">
            {sub.intervalLabel}
          </span>
        )}

        <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{sub.transactionCount ?? 0} transactions</div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" className="rounded-md px-3 py-1.5" disabled={decide.isPending} onClick={() => decide.mutate("confirmed")}>
            Confirm
          </Button>
          <Button variant="secondary" size="xs" className="rounded-md px-3 py-1.5 font-medium" disabled={decide.isPending} onClick={() => decide.mutate("dismissed")}>
            Dismiss
          </Button>
        </div>

        <span className="text-amber-400 dark:text-amber-500 text-xs">{expanded ? "▴" : "▾"}</span>
      </div>

      {decide.error && (
        <div className="px-5 pb-3">
          <ErrorText error={decide.error} />
        </div>
      )}

      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-700 bg-white/60 dark:bg-gray-900/40 px-5 py-3">
          <LinkedTransactions subscriptionId={sub.id} emptyText="No linked transactions yet." dividerClass="divide-amber-100 dark:divide-amber-900/30" />
        </div>
      )}
    </div>
  )
}
