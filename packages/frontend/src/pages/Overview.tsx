import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getAccounts,
  getTransactions,
  getCategories,
  updateTransaction,
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
  categories,
  token,
  onClose,
  onCategorize,
  onTransferChange,
}: {
  tx: TransactionWithDetails
  categories: Category[]
  token: string
  onClose: () => void
  onCategorize: (id: string, categoryId: string | null) => void
  onTransferChange: (updated: TransactionWithDetails) => void
}) {
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

            <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">Category</dt>
            <dd>
              <select
                className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                value={tx.categoryId ?? ""}
                onChange={(e) => onCategorize(tx.id, e.target.value || null)}
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
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
  const [searchParams] = useSearchParams()
  const initialAccountId = searchParams.get("account") ?? undefined

  const qc = useQueryClient()
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    () => initialAccountId ? new Set([initialAccountId]) : new Set()
  )
  const [selectedTx, setSelectedTx] = useState<TransactionWithDetails | null>(null)
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, pageSize: PAGE_SIZE })

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(token),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(token),
  })

  const accountIds = selectedAccounts.size > 0 ? [...selectedAccounts] : undefined

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", filters, accountIds],
    queryFn: () => getTransactions(token, { ...filters, accountIds }),
  })

  const categorize = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      updateTransaction(token, id, { categoryId }),
  })

  async function handleCategorize(id: string, categoryId: string | null) {
    await categorize.mutateAsync({ id, categoryId })
    qc.invalidateQueries({ queryKey: ["transactions"] })
    if (selectedTx?.id === id) {
      const cat = categories.find((c) => c.id === categoryId) ?? null
      setSelectedTx((prev) => (prev ? { ...prev, categoryId, category: cat } : null))
    }
  }

  function handleTransferChange(updated: TransactionWithDetails) {
    qc.invalidateQueries({ queryKey: ["transactions"] })
    setSelectedTx(updated)
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
          <option value="">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
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
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data?.data.map((tx: TransactionWithDetails) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      selectedTx?.id === tx.id ? "bg-indigo-50 dark:bg-indigo-950" : ""
                    }`}
                  >
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
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[220px] truncate">
                      {tx.description ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${
                        tx.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        value={tx.categoryId ?? ""}
                        onChange={(e) => handleCategorize(tx.id, e.target.value || null)}
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
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
          categories={categories}
          token={token}
          onClose={() => setSelectedTx(null)}
          onCategorize={handleCategorize}
          onTransferChange={handleTransferChange}
        />
      )}
    </div>
  )
}
