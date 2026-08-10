import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getAccounts,
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  runSubscriptionDetection,
  getSubscriptionTransactions,
} from "../api"
import type { Account, Subscription } from "@argent/shared"

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateCard({
  sub,
  token,
  onConfirmed,
  onDismissed,
}: {
  sub: Subscription
  token: string
  onConfirmed: (updated: Subscription) => void
  onDismissed: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
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

  async function confirm() {
    setBusy(true)
    try {
      const updated = await updateSubscription(token, sub.id, { status: "confirmed" })
      onConfirmed(updated)
    } finally {
      setBusy(false)
    }
  }

  async function dismiss() {
    setBusy(true)
    try {
      await updateSubscription(token, sub.id, { status: "dismissed" })
      onDismissed(sub.id)
    } finally {
      setBusy(false)
    }
  }

  const displayName = sub.name ?? sub.counterpartyName ?? sub.counterpartyIban

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50 dark:bg-amber-950/30 overflow-hidden">
      <div
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
          <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
            {sub.counterpartyIban}
          </div>
        </div>

        <div className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">
          {new Intl.NumberFormat("nl-NL", { style: "currency", currency: sub.currency }).format(
            parseFloat(sub.medianAmount)
          )}
        </div>

        {sub.intervalLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium border border-amber-200 dark:border-amber-800">
            {sub.intervalLabel}
          </span>
        )}

        <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
          {sub.transactionCount ?? 0} transactions
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={confirm}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            Confirm
          </button>
          <button
            onClick={dismiss}
            disabled={busy}
            className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 font-medium"
          >
            Dismiss
          </button>
        </div>

        <span className="text-amber-400 dark:text-amber-500 text-xs">{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-700 bg-white/60 dark:bg-gray-900/40 px-5 py-3">
          {txLoading ? (
            <p className="text-gray-400 dark:text-gray-500 text-xs">Loading transactions…</p>
          ) : txs?.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 text-xs">No linked transactions yet.</p>
          ) : (
            <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
              {txs?.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-gray-500 dark:text-gray-400 w-24 shrink-0">{tx.bookingDate}</span>
                  <span className="text-gray-600 dark:text-gray-400 flex-1 truncate px-3">{tx.description ?? "—"}</span>
                  <span className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">
                    {new Intl.NumberFormat("nl-NL", { style: "currency", currency: tx.currency }).format(
                      parseFloat(tx.amount)
                    )}
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

// ─── Confirmed Subscription Row ────────────────────────────────────────────────

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
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={saveName} className="text-sm px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="text-sm px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                Cancel
              </button>
            </div>
          ) : (
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</div>
          )}
          <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub.counterpartyIban}</div>
        </div>

        <div className="text-red-600 dark:text-red-400 font-mono font-medium whitespace-nowrap">
          {new Intl.NumberFormat("nl-NL", { style: "currency", currency: sub.currency }).format(
            parseFloat(sub.medianAmount)
          )}
        </div>

        {sub.intervalLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200 dark:border-indigo-800">
            {sub.intervalLabel}
          </span>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-24 text-right">
          {sub.nextExpectedDate ? (
            <>
              <div className="text-gray-400 dark:text-gray-500 text-[10px]">next</div>
              {sub.nextExpectedDate}
            </>
          ) : null}
        </div>

        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          sub.isActive
            ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
        }`}>
          {sub.isActive ? "active" : "inactive"}
        </span>

        <div className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right whitespace-nowrap">
          {sub.transactionCount ?? 0} tx
        </div>

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
                    {new Intl.NumberFormat("nl-NL", { style: "currency", currency: tx.currency }).format(
                      parseFloat(tx.amount)
                    )}
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

// ─── Add Subscription Form ────────────────────────────────────────────────────

function AddSubscriptionForm({
  accounts,
  token,
  onCreated,
  onCancel,
}: {
  accounts: Account[]
  token: string
  onCreated: (sub: Subscription) => void
  onCancel: () => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [counterpartyIban, setCounterpartyIban] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!counterpartyIban.trim()) return
    setBusy(true)
    setError(null)
    try {
      const sub = await createSubscription(token, {
        accountId,
        counterpartyIban: counterpartyIban.trim(),
        name: name.trim() || undefined,
      })
      onCreated(sub)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = "border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-5 py-4"
    >
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name ?? a.iban}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Counterparty IBAN</label>
          <input
            autoFocus
            type="text"
            value={counterpartyIban}
            onChange={(e) => setCounterpartyIban(e.target.value)}
            placeholder="NL00BANK0123456789"
            className={`${inputCls} w-52 font-mono`}
            required
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Label (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Netflix"
            className={`${inputCls} w-40`}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !counterpartyIban.trim()}
          className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}

// ─── Subscriptions Page ────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()
  const [detecting, setDetecting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [tab, setTab] = useState<"confirmed" | "candidates">("confirmed")

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => getSubscriptions(token),
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(token),
  })

  const candidates = subs.filter((s) => s.status === "candidate")
  const confirmed = subs.filter((s) => s.status === "confirmed")

  function handleUpdated(updated: Subscription) {
    qc.setQueryData<Subscription[]>(["subscriptions"], (prev) =>
      updated.status === "dismissed"
        ? prev?.filter((s) => s.id !== updated.id) ?? []
        : prev?.map((s) => (s.id === updated.id ? updated : s)) ?? [updated]
    )
  }

  function handleDeleted(id: string) {
    qc.setQueryData<Subscription[]>(["subscriptions"], (prev) =>
      prev?.filter((s) => s.id !== id) ?? []
    )
  }

  function handleCreated(sub: Subscription) {
    qc.setQueryData<Subscription[]>(["subscriptions"], (prev) => [sub, ...(prev ?? [])])
    setShowAddForm(false)
  }

  function handleConfirmed(updated: Subscription) {
    qc.setQueryData<Subscription[]>(["subscriptions"], (prev) =>
      prev?.map((s) => (s.id === updated.id ? updated : s)) ?? [updated]
    )
  }

  async function handleDetect() {
    setDetecting(true)
    try {
      const { detected } = await runSubscriptionDetection(token)
      if (detected > 0) {
        qc.invalidateQueries({ queryKey: ["subscriptions"] })
        setTab("candidates")
      } else {
        alert("No new recurring patterns found.")
      }
    } finally {
      setDetecting(false)
    }
  }

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
      active
        ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
    }`

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Subscriptions</h1>
        <div className="flex items-center gap-2">
          {tab === "confirmed" && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              + Add
            </button>
          )}
          {tab === "candidates" && (
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {detecting ? "Detecting…" : "Run Detection"}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex -mb-px">
          <button className={tabCls(tab === "confirmed")} onClick={() => setTab("confirmed")}>
            My Subscriptions
          </button>
          <button className={tabCls(tab === "candidates")} onClick={() => setTab("candidates")}>
            Discovered
            {candidates.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                {candidates.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {isLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
      ) : tab === "confirmed" ? (
        <div className="flex flex-col gap-4">
          {showAddForm && accounts.length > 0 && (
            <AddSubscriptionForm
              accounts={accounts}
              token={token}
              onCreated={handleCreated}
              onCancel={() => setShowAddForm(false)}
            />
          )}
          {confirmed.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
                No confirmed subscriptions yet.
              </p>
              {candidates.length > 0 ? (
                <button
                  onClick={() => setTab("candidates")}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {candidates.length} suggestion{candidates.length !== 1 ? "s" : ""} waiting in Discovered →
                </button>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 text-xs">
                  Import transactions and use the Discovered tab to find recurring patterns, or add one manually.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {confirmed.map((sub) => (
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
      ) : (
        <div className="flex flex-col gap-3">
          {candidates.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
              No suggestions found. Click "Run Detection" to search for recurring payments.
            </div>
          ) : (
            candidates.map((sub) => (
              <CandidateCard
                key={sub.id}
                sub={sub}
                token={token}
                onConfirmed={handleConfirmed}
                onDismissed={(id) =>
                  qc.setQueryData<Subscription[]>(["subscriptions"], (prev) =>
                    prev?.filter((s) => s.id !== id) ?? []
                  )
                }
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
