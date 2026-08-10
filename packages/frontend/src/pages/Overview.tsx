import { useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getAccounts,
  getTransactions,
  getCategories,
  updateTransaction,
  createSubscription,
  getTransferSuggestions,
  linkTransfer,
  unlinkTransfer,
} from "../api"
import type {
  Account,
  Category,
  TransactionFilters,
  TransactionWithDetails,
  TransferPeerSummary,
} from "@argent/shared"

const PAGE_SIZE = 50

function formatAmount(amount: string, indicator: string, currency: string) {
  const n = parseFloat(amount)
  const signed = indicator === "DBIT" ? -n : n
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(signed)
}

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls = "border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

// ─── Transfer Link Section ────────────────────────────────────────────────────

function LinkTransferSection({
  tx,
  token,
  onLinked,
}: {
  tx: TransactionWithDetails
  token: string
  onLinked: (updated: TransactionWithDetails) => void
}) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<TransferPeerSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)

  async function toggle() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (suggestions === null) {
      setLoading(true)
      try {
        setSuggestions(await getTransferSuggestions(token, tx.id))
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleLink(peerId: string) {
    setLinking(peerId)
    try {
      const updated = await linkTransfer(token, tx.id, { peerId })
      onLinked(updated)
    } finally {
      setLinking(null)
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
      >
        Link as transfer {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden text-xs">
          {loading ? (
            <p className="text-gray-400 dark:text-gray-500 px-3 py-2">Finding suggestions…</p>
          ) : suggestions?.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 px-3 py-2">No matching transactions found.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {suggestions?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleLink(s.id)}
                  disabled={!!linking}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-left disabled:opacity-50"
                >
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {s.account.name ?? s.account.iban}
                    </div>
                    <div className="text-gray-400 dark:text-gray-500">{s.bookingDate}</div>
                  </div>
                  <div
                    className={`font-mono font-medium ${
                      s.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatAmount(s.amount, s.creditDebitIndicator, s.currency)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Transaction Detail Slide-out ────────────────────────────────────────────

function TransactionDetail({
  tx,
  labels,
  token,
  onClose,
  onLabel,
  onTransferChange,
}: {
  tx: TransactionWithDetails
  labels: Category[]
  token: string
  onClose: () => void
  onLabel: (id: string, categoryId: string | null) => void
  onTransferChange: (updated: TransactionWithDetails) => void
}) {
  const navigate = useNavigate()

  async function handleUnlink() {
    await unlinkTransfer(token, tx.id)
    onTransferChange({ ...tx, transferPeerId: null, transferPeer: null })
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Transaction Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Amount */}
          <div
            className={`text-3xl font-bold ${
              tx.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
          </div>

          {/* Details grid */}
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Booking date</dt>
            <dd className="text-gray-900 dark:text-gray-100">{tx.bookingDate}</dd>

            {tx.valueDate && tx.valueDate !== tx.bookingDate && (
              <>
                <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Value date</dt>
                <dd className="text-gray-900 dark:text-gray-100">{tx.valueDate}</dd>
              </>
            )}

            <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Account</dt>
            <dd>
              <div className="text-gray-900 dark:text-gray-100">{tx.account.name ?? tx.account.iban}</div>
              {tx.account.name && (
                <div className="text-gray-400 dark:text-gray-500 text-xs font-mono mt-0.5">{tx.account.iban}</div>
              )}
            </dd>

            {tx.counterpartyName && !tx.transferPeerId && (
              <>
                <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Counterparty</dt>
                <dd>
                  <div className="text-gray-900 dark:text-gray-100">{tx.counterpartyName}</div>
                  {tx.counterpartyIban && (
                    <div className="text-gray-400 dark:text-gray-500 text-xs font-mono mt-0.5">
                      {tx.counterpartyIban}
                    </div>
                  )}
                </dd>
              </>
            )}

            {tx.description && (
              <>
                <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Description</dt>
                <dd className="text-gray-900 dark:text-gray-100 break-words">{tx.description}</dd>
              </>
            )}

            {tx.reference && (
              <>
                <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Reference</dt>
                <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{tx.reference}</dd>
              </>
            )}

            <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Transfer</dt>
            <dd>
              {tx.transferPeer ? (
                <div className="flex items-center gap-3">
                  <span className="text-indigo-700 dark:text-indigo-300 font-medium">
                    ↔ {tx.transferPeer.account.name ?? tx.transferPeer.account.iban}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs">{tx.transferPeer.bookingDate}</span>
                  <button
                    onClick={handleUnlink}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-auto"
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <LinkTransferSection tx={tx} token={token} onLinked={onTransferChange} />
              )}
            </dd>

            {tx.subscriptionId && (
              <>
                <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Subscription</dt>
                <dd>
                  <button
                    onClick={() => { onClose(); navigate("/subscriptions") }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium"
                  >
                    ↻ View subscription →
                  </button>
                </dd>
              </>
            )}

            <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Label</dt>
            <dd>
              <select
                className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                value={tx.categoryId ?? ""}
                onChange={(e) => onLabel(tx.id, e.target.value || null)}
              >
                <option value="">Unlabeled</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </dd>
          </dl>
        </div>
      </div>
    </>
  )
}

// ─── Account Selector ─────────────────────────────────────────────────────────

function AccountSelector({
  accounts,
  selected,
  onChange,
}: {
  accounts: Account[]
  selected: Set<string>
  onChange: (ids: Set<string>) => void
}) {
  const allSelected = selected.size === 0

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => onChange(new Set())}
        className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
          allSelected
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
        }`}
      >
        All accounts
      </button>
      {accounts.map((acc) => {
        const active = selected.has(acc.id)
        return (
          <button
            key={acc.id}
            onClick={() => toggle(acc.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              active
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            {acc.name ?? acc.iban}
          </button>
        )
      })}
    </div>
  )
}

// ─── Overview Page ────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountId = searchParams.get("account") ?? undefined

  const qc = useQueryClient()
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    () => initialAccountId ? new Set([initialAccountId]) : new Set()
  )
  const [selectedTx, setSelectedTx] = useState<TransactionWithDetails | null>(null)
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, pageSize: PAGE_SIZE })

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLabelId, setBulkLabelId] = useState("")
  const [bulkLabeling, setBulkLabeling] = useState(false)
  const [showSubForm, setShowSubForm] = useState(false)
  const [subName, setSubName] = useState("")
  const [subCreating, setSubCreating] = useState(false)

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(token),
  })

  const { data: labels = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(token),
  })

  const accountIds = selectedAccounts.size > 0 ? [...selectedAccounts] : undefined

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", filters, accountIds],
    queryFn: () => getTransactions(token, { ...filters, accountIds }),
  })

  const rows = data?.data ?? []

  const labelMutation = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      updateTransaction(token, id, { categoryId }),
  })

  async function handleLabel(id: string, categoryId: string | null) {
    await labelMutation.mutateAsync({ id, categoryId })
    qc.invalidateQueries({ queryKey: ["transactions"] })
    if (selectedTx?.id === id) {
      const label = labels.find((l) => l.id === categoryId) ?? null
      setSelectedTx((prev) => (prev ? { ...prev, categoryId, category: label } : null))
    }
  }

  async function handleBulkLabel() {
    if (selectedIds.size === 0) return
    setBulkLabeling(true)
    try {
      for (const id of selectedIds) {
        await updateTransaction(token, id, { categoryId: bulkLabelId || null })
      }
      qc.invalidateQueries({ queryKey: ["transactions"] })
      setSelectedIds(new Set())
    } finally {
      setBulkLabeling(false)
    }
  }

  // Derive a common (accountId, counterpartyIban) from the selected visible rows.
  // Returns null if the selection spans different IBANs/accounts or has no IBAN.
  const subscriptionTarget = (() => {
    const eligible = rows.filter((r) => selectedIds.has(r.id) && r.counterpartyIban && !r.transferPeerId)
    if (eligible.length === 0) return null
    const first = eligible[0]
    if (!eligible.every((r) => r.accountId === first.accountId && r.counterpartyIban === first.counterpartyIban))
      return null
    return { accountId: first.accountId, counterpartyIban: first.counterpartyIban!, counterpartyName: first.counterpartyName }
  })()

  async function handleCreateSubscription() {
    if (!subscriptionTarget) return
    setSubCreating(true)
    try {
      await createSubscription(token, {
        accountId: subscriptionTarget.accountId,
        counterpartyIban: subscriptionTarget.counterpartyIban,
        name: subName.trim() || undefined,
      })
      setSelectedIds(new Set())
      setShowSubForm(false)
      setSubName("")
      navigate("/subscriptions")
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setSubCreating(false)
    }
  }

  function handleTransferChange(updated: TransactionWithDetails) {
    qc.invalidateQueries({ queryKey: ["transactions"] })
    setSelectedTx(updated)
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)))
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Transactions</h1>

      {accounts.length > 0 && (
        <AccountSelector
          accounts={accounts}
          selected={selectedAccounts}
          onChange={(ids) => {
            setSelectedAccounts(ids)
            setFilters((f) => ({ ...f, page: 1 }))
          }}
        />
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search description…"
          className={`${inputCls} w-60`}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
        />
        <input
          type="date"
          className={inputCls}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
        />
        <input
          type="date"
          className={inputCls}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
        />
        <select
          className={inputCls}
          onChange={(e) =>
            setFilters((f) => ({ ...f, categoryId: e.target.value || undefined, page: 1 }))
          }
        >
          <option value="">All labels</option>
          <option value="uncategorized">Unlabeled</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
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
                {rows.map((tx: TransactionWithDetails) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      selectedTx?.id === tx.id ? "bg-indigo-50 dark:bg-indigo-950" : ""
                    } ${selectedIds.has(tx.id) ? "bg-indigo-50/60 dark:bg-indigo-950/40" : ""}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(tx.id)}
                        onChange={() => toggleRow(tx.id)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                      />
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{tx.bookingDate}</td>

                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[120px] truncate">
                      {tx.account.name ?? tx.account.iban}
                    </td>

                    <td className="px-4 py-3 max-w-[140px] truncate">
                      {tx.transferPeer ? (
                        <span className="text-indigo-500 dark:text-indigo-400 text-xs font-medium">
                          ↔ {tx.transferPeer.account.name ?? tx.transferPeer.account.iban}
                        </span>
                      ) : (
                        <span className="text-gray-900 dark:text-gray-100">
                          {tx.counterpartyName ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </span>
                      )}
                    </td>

                    {/* Description + subscription badge */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="text-gray-600 dark:text-gray-400 truncate">
                        {tx.description ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                      </div>
                      {tx.subscriptionId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate("/subscriptions") }}
                          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium leading-none"
                        >
                          ↻ subscription
                        </button>
                      )}
                    </td>

                    <td
                      className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${
                        tx.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
                    </td>

                    {/* Label chip */}
                    <td className="px-4 py-3">
                      {tx.category ? (
                        <span
                          className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border"
                          style={{
                            backgroundColor: tx.category.color ? `${tx.category.color}22` : "#6366f122",
                            color: tx.category.color ?? "#6366f1",
                            borderColor: tx.category.color ? `${tx.category.color}44` : "#6366f144",
                          }}
                        >
                          {tx.category.name}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                      )}
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

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
            <span>{data?.total ?? 0} transactions</span>
            <div className="flex gap-2">
              <button
                disabled={filters.page === 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="px-3 py-1">Page {filters.page}</span>
              <button
                disabled={(data?.total ?? 0) <= (filters.page ?? 1) * PAGE_SIZE}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selectedTx && (
        <TransactionDetail
          tx={selectedTx}
          labels={labels}
          token={token}
          onClose={() => setSelectedTx(null)}
          onLabel={handleLabel}
          onTransferChange={handleTransferChange}
        />
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-5 py-3">
          {showSubForm && subscriptionTarget ? (
            // ── Subscription creation mode ──────────────────────────────────
            <>
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                ↻ {subscriptionTarget.counterpartyName ?? subscriptionTarget.counterpartyIban}
              </span>
              <input
                autoFocus
                type="text"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                placeholder="Name (optional)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSubscription()
                  if (e.key === "Escape") setShowSubForm(false)
                }}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 w-40 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleCreateSubscription}
                disabled={subCreating}
                className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {subCreating ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => setShowSubForm(false)}
                className="text-sm px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </>
          ) : (
            // ── Default label mode ───────────────────────────────────────────
            <>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                {selectedIds.size} selected
              </span>
              <select
                value={bulkLabelId}
                onChange={(e) => setBulkLabelId(e.target.value)}
                className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Unlabeled</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <button
                onClick={handleBulkLabel}
                disabled={bulkLabeling}
                className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {bulkLabeling ? "Applying…" : "Apply label"}
              </button>
              {subscriptionTarget && (
                <>
                  <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
                  <button
                    onClick={() => setShowSubForm(true)}
                    className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 font-medium whitespace-nowrap"
                  >
                    ↻ Create subscription
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
