import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { Subscription } from "@argent/shared"
import { deleteSubscription, updateSubscription, useInvalidate } from "../../api"
import { Button, ConfirmButton, ErrorText, Input, cx } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import { LinkedTransactions } from "./LinkedTransactions"

/** A confirmed subscription: amount, interval, next payment; rename, (de)activate, delete; expand for its payments. */
export function SubscriptionRow({ sub }: { sub: Subscription }) {
  const invalidate = useInvalidate()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(sub.name ?? "")

  const update = useMutation({
    mutationFn: (changes: { name?: string; isActive?: boolean }) => updateSubscription(sub.id, changes),
    onSuccess: () => invalidate.subscriptions(),
  })
  const remove = useMutation({ mutationFn: () => deleteSubscription(sub.id), onSuccess: () => invalidate.subscriptions() })

  const saveName = () => update.mutate({ name: nameInput }, { onSuccess: () => setEditing(false) })
  const displayName = sub.name ?? sub.counterpartyName ?? sub.counterpartyIban

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => setExpanded((v) => !v)}>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Input
                autoFocus
                density="sm"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName()
                  if (e.key === "Escape") setEditing(false)
                }}
                placeholder="Subscription name…"
                aria-label="Subscription name"
                className="w-56 border-indigo-300 dark:border-indigo-600"
              />
              <Button size="sm" className="!py-1" disabled={update.isPending} onClick={saveName}>
                Save
              </Button>
              <Button variant="muted-link" size="sm" className="!px-2 !py-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
          )}
          <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub.counterpartyIban}</div>
        </div>

        <div className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">{fmtBalance(sub.medianAmount, sub.currency, "nl-NL")}</div>

        {sub.intervalLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200 dark:border-indigo-800">
            {sub.intervalLabel}
          </span>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-24 text-right">
          {sub.nextExpectedDate && (
            <>
              <div className="text-gray-400 dark:text-gray-500 text-[10px]">next</div>
              {sub.nextExpectedDate}
            </>
          )}
        </div>

        <span
          className={cx(
            "text-xs px-2 py-0.5 rounded-full font-medium",
            sub.isActive
              ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700",
          )}
        >
          {sub.isActive ? "active" : "inactive"}
        </span>

        <div className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right whitespace-nowrap">{sub.transactionCount ?? 0} tx</div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!editing && (
            <Button
              variant="link"
              size="xs"
              onClick={() => {
                setNameInput(sub.name ?? "")
                setEditing(true)
              }}
            >
              Rename
            </Button>
          )}
          <Button variant="muted-link" size="xs" className="font-medium" disabled={update.isPending} onClick={() => update.mutate({ isActive: !sub.isActive })}>
            {sub.isActive ? "Deactivate" : "Activate"}
          </Button>
          <ConfirmButton label="Delete" prompt={`Delete subscription for ${sub.counterpartyName ?? sub.counterpartyIban}?`} onConfirm={() => remove.mutate()} />
        </div>

        <span className="text-gray-400 dark:text-gray-500 text-xs">{expanded ? "▴" : "▾"}</span>
      </div>

      {(update.error || remove.error) && (
        <div className="px-5 pb-3">
          <ErrorText error={update.error ?? remove.error} />
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-5 py-3">
          <LinkedTransactions subscriptionId={sub.id} emptyText="No linked transactions." dividerClass="divide-gray-100 dark:divide-gray-700" />
        </div>
      )}
    </div>
  )
}
