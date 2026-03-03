import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  runSubscriptionDetection,
  getSubscriptionTransactions,
} from "../api"
import type { Subscription } from "@argent/shared"

function SubscriptionRow({
  sub,
  token,
  onUpdated,
  onDeleted,
}: {
  sub: Subscription
  token: string
  onUpdated: (updated: Subscription) => void
  onDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(sub.name ?? "")
  const [txs, setTxs] = useState<Array<{
    id: string; bookingDate: string; amount: string; currency: string
    creditDebitIndicator: string; description: string | null
  }> | null>(null)
  const [txLoading, setTxLoading] = useState(false)

  async function toggleExpand() {
    setExpanded((v) => !v)
    if (!expanded && txs === null) {
      setTxLoading(true)
      try {
        setTxs(await getSubscriptionTransactions(token, sub.id))
      } finally {
        setTxLoading(false)
      }
    }
  }

  async function saveName() {
    const updated = await updateSubscription(token, sub.id, { name: nameInput })
    onUpdated(updated)
    setEditing(false)
  }

  async function toggleActive() {
    const updated = await updateSubscription(token, sub.id, { isActive: !sub.isActive })
    onUpdated(updated)
  }

  async function handleDelete() {
    if (!confirm(`Delete subscription for ${sub.counterpartyName ?? sub.counterpartyIban}?`)) return
    await deleteSubscription(token, sub.id)
    onDeleted(sub.id)
  }

  const displayName = sub.name ?? sub.counterpartyName ?? sub.counterpartyIban

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
        onClick={toggleExpand}
      >
        {/* Name + IBAN */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName()
                  if (e.key === "Escape") setEditing(false)
                }}
                className="border border-indigo-300 dark:border-indigo-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-56"
                placeholder="Subscription name…"
              />
              <button
                onClick={saveName}
                className="text-sm px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
          )}
          <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub.counterpartyIban}</div>
        </div>

        {/* Median amount */}
        <div className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">
          {new Intl.NumberFormat("nl-NL", {
            style: "currency",
            currency: sub.currency,
          }).format(parseFloat(sub.medianAmount))}
        </div>

        {/* Interval badge */}
        {sub.intervalLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200 dark:border-indigo-800">
            {sub.intervalLabel}
          </span>
        )}

        {/* Next expected date */}
        <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-24 text-right">
          {sub.nextExpectedDate ? (
            <>
              <div className="text-gray-400 dark:text-gray-500 text-[10px]">next</div>
              {sub.nextExpectedDate}
            </>
          ) : null}
        </div>

        {/* Active badge */}
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            sub.isActive
              ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
          }`}
        >
          {sub.isActive ? "active" : "inactive"}
        </span>

        {/* Transaction count */}
        <div className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right whitespace-nowrap">
          {sub.transactionCount ?? 0} tx
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!editing && (
            <button
              onClick={() => { setEditing(true); setNameInput(sub.name ?? "") }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
            >
              Rename
            </button>
          )}
          <button
            onClick={toggleActive}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium"
          >
            {sub.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
          >
            Delete
          </button>
        </div>

        <span className="text-gray-400 dark:text-gray-500 text-xs">{expanded ? "▴" : "▾"}</span>
      </div>

      {/* Expanded transaction list */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-5 py-3">
          {txLoading ? (
            <p className="text-gray-400 dark:text-gray-500 text-xs">Loading transactions…</p>
          ) : txs?.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-xs">No linked transactions.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {txs?.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{tx.bookingDate}</span>
                  <span className="text-gray-600 dark:text-gray-400 flex-1 truncate px-3">{tx.description ?? "—"}</span>
                  <span className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">
                    {new Intl.NumberFormat("nl-NL", {
                      style: "currency",
                      currency: tx.currency,
                    }).format(parseFloat(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SubscriptionsPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()
  const [detecting, setDetecting] = useState(false)

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => getSubscriptions(token),
  })

  function handleUpdated(updated: Subscription) {
    qc.setQueryData<Subscription[]>(["subscriptions"], (prev) =>
      prev?.map((s) => (s.id === updated.id ? updated : s)) ?? [updated]
    )
  }

  function handleDeleted(id: string) {
    qc.setQueryData<Subscription[]>(["subscriptions"], (prev) =>
      prev?.filter((s) => s.id !== id) ?? []
    )
  }

  async function handleDetect() {
    setDetecting(true)
    try {
      const { detected } = await runSubscriptionDetection(token)
      if (detected > 0) {
        qc.invalidateQueries({ queryKey: ["subscriptions"] })
        alert(`Detected ${detected} new subscription(s).`)
      } else {
        alert("No new subscriptions detected.")
      }
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Subscriptions</h1>
        <button
          onClick={handleDetect}
          disabled={detecting}
          className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {detecting ? "Detecting…" : "Run Detection"}
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
      ) : subs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
          No subscriptions detected yet. Import transactions and click "Run Detection".
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {subs.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              token={token}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
