import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCryptoPortfolios,
  getCryptoPortfolio,
  createCryptoPortfolio,
  deleteCryptoPortfolio,
  addCryptoTrade,
  addCryptoPortfolioMember,
  removeCryptoPortfolioMember,
} from "../api"
import type { AssetPosition, PortfolioDetail, PortfolioMember, PortfolioWithAccess, CryptoTrade } from "@argent/shared"

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-EU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCur(n: number, currency: string) {
  return (currency === "USD" ? "$" : "€") + fmt(n)
}

function pnlColor(n: number) {
  if (n > 0) return "text-green-600 dark:text-green-400"
  if (n < 0) return "text-red-600 dark:text-red-400"
  return "text-gray-500 dark:text-gray-400"
}

function pnlFmt(n: number, currency: string) {
  return (n >= 0 ? "+" : "") + fmtCur(n, currency)
}

const INPUT = "w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

export default function CryptoPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()

  const { data: portfolios = [], isLoading: loadingList } = useQuery({
    queryKey: ["crypto-portfolios"],
    queryFn: () => getCryptoPortfolios(token),
    enabled: !!token,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeId = selectedId ?? portfolios[0]?.id ?? null

  const { data: portfolio, isLoading: loadingDetail } = useQuery<PortfolioDetail>({
    queryKey: ["crypto-portfolio", activeId],
    queryFn: () => getCryptoPortfolio(token, activeId!),
    enabled: !!token && !!activeId,
  })

  const [creatingPortfolio, setCreatingPortfolio] = useState(false)
  const [newPortfolioName, setNewPortfolioName] = useState("")
  const [newPortfolioCurrency, setNewPortfolioCurrency] = useState<"EUR" | "USD">("EUR")

  async function handleCreatePortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!newPortfolioName.trim()) return
    const created = await createCryptoPortfolio(token, { name: newPortfolioName.trim(), currency: newPortfolioCurrency })
    qc.invalidateQueries({ queryKey: ["crypto-portfolios"] })
    setSelectedId(created.id)
    setNewPortfolioName("")
    setCreatingPortfolio(false)
  }

  if (loadingList) return <p className="text-gray-400 text-sm">Loading…</p>

  if (portfolios.length === 0 && !creatingPortfolio) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Crypto</h1>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-6 py-10 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No crypto portfolio yet.</p>
          <button
            onClick={() => setCreatingPortfolio(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create portfolio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Crypto</h1>
        <button
          onClick={() => setCreatingPortfolio(true)}
          className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
        >
          + New portfolio
        </button>
      </div>

      {creatingPortfolio && (
        <form onSubmit={handleCreatePortfolio} className="mb-6 flex gap-2 flex-wrap items-center">
          <input
            autoFocus
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            placeholder="Portfolio name"
            className="flex-1 min-w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 text-sm">
            {(["EUR", "USD"] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => setNewPortfolioCurrency(cur)}
                className={`px-3 py-2 font-medium transition-colors ${
                  newPortfolioCurrency === cur
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
          <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Create</button>
          <button type="button" onClick={() => setCreatingPortfolio(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
        </form>
      )}

      {portfolios.length > 1 && (
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
          {portfolios.map((p: PortfolioWithAccess) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeId === p.id
                  ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {loadingDetail && <p className="text-gray-400 text-sm">Loading portfolio…</p>}
      {portfolio && (
        <PortfolioView
          portfolio={portfolio}
          token={token}
          onTradeAdded={() => qc.invalidateQueries({ queryKey: ["crypto-portfolio", activeId] })}
          onDeleted={() => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["crypto-portfolios"] }) }}
        />
      )}
    </div>
  )
}

// ─── Portfolio detail view ────────────────────────────────────────────────────

const EMPTY_FORM = {
  direction: "buy" as "buy" | "swap" | "sell",
  symbol: "",
  coinName: "",
  baseCurAmount: "",
  coinAmount: "",
  toSymbol: "",
  toAmount: "",
  tradeDate: "",
  notes: "",
}

function PortfolioView({
  portfolio,
  token,
  onTradeAdded,
  onDeleted,
}: {
  portfolio: PortfolioDetail
  token: string
  onTradeAdded: () => void
  onDeleted: () => void
}) {
  const [addingTrade, setAddingTrade] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const cur = portfolio.currency
  const sellablePositions = portfolio.positions.filter((p) => p.balance > 1e-10)

  async function handleAddTrade(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      let body
      if (form.direction === "buy") {
        body = {
          tradeDate: form.tradeDate,
          fromSymbol: cur,
          fromAmount: form.baseCurAmount,
          toSymbol: form.symbol.toUpperCase().trim(),
          toAmount: form.coinAmount,
          assetName: form.coinName.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }
      } else if (form.direction === "sell") {
        body = {
          tradeDate: form.tradeDate,
          fromSymbol: form.symbol.toUpperCase().trim(),
          fromAmount: form.coinAmount,
          toSymbol: cur,
          toAmount: form.baseCurAmount,
          notes: form.notes.trim() || undefined,
        }
      } else {
        body = {
          tradeDate: form.tradeDate,
          fromSymbol: form.symbol.toUpperCase().trim(),
          fromAmount: form.coinAmount,
          toSymbol: form.toSymbol.toUpperCase().trim(),
          toAmount: form.toAmount,
          notes: form.notes.trim() || undefined,
        }
      }
      await addCryptoTrade(token, portfolio.id, body)
      onTradeAdded()
      setForm(EMPTY_FORM)
      setAddingTrade(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Open cost", value: fmtCur(portfolio.totalOpenCostEur, cur) },
          {
            label: "Current value",
            value: portfolio.totalCurrentValueEur != null ? fmtCur(portfolio.totalCurrentValueEur, cur) : "—",
          },
          {
            label: "Unrealized P&L",
            value: portfolio.totalUnrealizedPnL != null ? pnlFmt(portfolio.totalUnrealizedPnL, cur) : "—",
            color: portfolio.totalUnrealizedPnL != null ? pnlColor(portfolio.totalUnrealizedPnL) : undefined,
          },
          {
            label: "Realized P&L",
            value: pnlFmt(portfolio.totalRealizedPnL, cur),
            color: pnlColor(portfolio.totalRealizedPnL),
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
            <p className={`text-lg font-semibold ${color ?? "text-gray-900 dark:text-gray-100"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Symbol</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-right">Avg cost</th>
              <th className="px-4 py-3 text-right">Current</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Unrealized</th>
              <th className="px-4 py-3 text-right">Realized</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {portfolio.positions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  No positions yet. Record a buy trade below.
                </td>
              </tr>
            )}
            {portfolio.positions.map((pos: AssetPosition) => (
              <tr key={pos.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-mono font-semibold text-indigo-700 dark:text-indigo-300">{pos.symbol}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{pos.name}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
                  {pos.balance.toLocaleString("en-US", { maximumSignificantDigits: 8 })}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                  {fmtCur(pos.avgCostBasis, cur)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                  {pos.currentPrice != null ? fmtCur(pos.currentPrice, cur) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
                  {pos.currentValueEur != null ? fmtCur(pos.currentValueEur, cur) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${pos.unrealizedPnL != null ? pnlColor(pos.unrealizedPnL) : "text-gray-300 dark:text-gray-600"}`}>
                  {pos.unrealizedPnL != null ? pnlFmt(pos.unrealizedPnL, cur) : "—"}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${pnlColor(pos.realizedPnL)}`}>
                  {pnlFmt(pos.realizedPnL, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add trade */}
      {portfolio.canEdit && !addingTrade ? (
        <button
          onClick={() => setAddingTrade(true)}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-4"
        >
          + Record trade
        </button>
      ) : portfolio.canEdit && (
        <form
          onSubmit={handleAddTrade}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4"
        >
          {/* Direction toggle */}
          <div className="flex gap-2 mb-4">
            {(["buy", "swap", "sell"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setForm(() => ({ ...EMPTY_FORM, direction: dir }))}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                  form.direction === dir
                    ? dir === "buy"
                      ? "bg-green-600 text-white"
                      : dir === "sell"
                      ? "bg-red-600 text-white"
                      : "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          {form.direction === "swap" && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded px-3 py-2">
              Cost basis transfers automatically — no P&L is realized at swap time.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* From symbol */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {form.direction === "buy" ? "Symbol" : "From symbol"}
              </label>
              {(form.direction === "sell" || form.direction === "swap") && sellablePositions.length > 0 ? (
                <select
                  required
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Select…</option>
                  {sellablePositions.map((p) => (
                    <option key={p.symbol} value={p.symbol}>
                      {p.symbol} ({p.balance.toLocaleString("en-US", { maximumSignificantDigits: 6 })})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  placeholder="BTC"
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  className={INPUT}
                />
              )}
            </div>

            {/* Coin name (buy only) */}
            {form.direction === "buy" && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Coin name</label>
                <input
                  placeholder="Bitcoin"
                  value={form.coinName}
                  onChange={(e) => setForm((f) => ({ ...f, coinName: e.target.value }))}
                  className={INPUT}
                />
              </div>
            )}

            {/* From amount */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {form.direction === "buy" ? "Amount received" : "Amount sold"}
              </label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="0.5"
                value={form.coinAmount}
                onChange={(e) => setForm((f) => ({ ...f, coinAmount: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* To symbol (swap only) */}
            {form.direction === "swap" && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">To symbol</label>
                <input
                  required
                  placeholder="ETH"
                  value={form.toSymbol}
                  onChange={(e) => setForm((f) => ({ ...f, toSymbol: e.target.value }))}
                  className={INPUT}
                />
              </div>
            )}

            {/* To amount (swap only) */}
            {form.direction === "swap" && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Amount received</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  placeholder="3.0"
                  value={form.toAmount}
                  onChange={(e) => setForm((f) => ({ ...f, toAmount: e.target.value }))}
                  className={INPUT}
                />
              </div>
            )}

            {/* Base currency amount (buy or sell only) */}
            {form.direction !== "swap" && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                  {cur} {form.direction === "buy" ? "paid" : "received"}
                </label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  placeholder="20000"
                  value={form.baseCurAmount}
                  onChange={(e) => setForm((f) => ({ ...f, baseCurAmount: e.target.value }))}
                  className={INPUT}
                />
              </div>
            )}

            {/* Date */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date</label>
              <input
                required
                type="date"
                value={form.tradeDate}
                onChange={(e) => setForm((f) => ({ ...f, tradeDate: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
              <input
                placeholder="Optional"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg"
            >
              {submitting ? "Saving…" : "Save trade"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingTrade(false); setForm(EMPTY_FORM) }}
              className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Trade history */}
      {portfolio.trades.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span>Trade history ({portfolio.trades.length})</span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={`transition-transform ${showHistory ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showHistory && (
            <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-right">From</th>
                    <th className="px-4 py-2 text-right">To</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {[...portfolio.trades].reverse().map((t: CryptoTrade) => {
                    const isBuy = t.fromSymbol === cur
                    const isSell = t.toSymbol === cur
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{t.tradeDate}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            isBuy ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : isSell ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                              : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                          }`}>
                            {isBuy ? "Buy" : isSell ? "Sell" : "Swap"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                          {parseFloat(t.fromAmount).toLocaleString("en-US", { maximumSignificantDigits: 8 })} {t.fromSymbol}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                          {parseFloat(t.toAmount).toLocaleString("en-US", { maximumSignificantDigits: 8 })} {t.toSymbol}
                        </td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{t.notes ?? ""}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Share & delete (owner-only) */}
      {portfolio.isOwner && (
        <PortfolioActions portfolio={portfolio} token={token} onDeleted={onDeleted} />
      )}
    </>
  )
}

// ─── Portfolio actions (owner: share + delete) ────────────────────────────────

function PortfolioActions({
  portfolio,
  token,
  onDeleted,
}: {
  portfolio: PortfolioDetail
  token: string
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [showAccess, setShowAccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")

  const addMember = useMutation({
    mutationFn: () => addCryptoPortfolioMember(token, portfolio.id, { groupName: groupName.trim(), role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crypto-portfolio", portfolio.id] })
      qc.invalidateQueries({ queryKey: ["crypto-portfolios"] })
      setGroupName("")
    },
  })

  const removeMember = useMutation({
    mutationFn: (gn: string) => removeCryptoPortfolioMember(token, portfolio.id, gn),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crypto-portfolio", portfolio.id] })
      qc.invalidateQueries({ queryKey: ["crypto-portfolios"] })
    },
  })

  const deletePortfolio = useMutation({
    mutationFn: () => deleteCryptoPortfolio(token, portfolio.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crypto-portfolios"] })
      onDeleted()
    },
  })

  return (
    <div className="mt-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setShowAccess((v) => !v)}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {showAccess ? "Hide access" : "Share"}
        </button>
        <div className="flex items-center gap-3">
          {confirmDelete ? (
            <>
              <span className="text-xs text-gray-500 dark:text-gray-400">Delete portfolio?</span>
              <button onClick={() => deletePortfolio.mutate()} className="text-xs text-red-600 dark:text-red-400 font-medium">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">No</button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
            >
              Delete portfolio
            </button>
          )}
        </div>
      </div>

      {showAccess && (
        <div className="px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
            Shared access
          </p>
          {portfolio.members.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Not shared with anyone.</p>
          ) : (
            <div className="flex flex-col gap-1.5 mb-3">
              {portfolio.members.map((m: PortfolioMember) => (
                <div key={m.groupName} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{m.groupName}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    m.role === "editor"
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}>
                    {m.role}
                  </span>
                  <button
                    onClick={() => removeMember.mutate(m.groupName)}
                    disabled={removeMember.isPending}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Group name</label>
              <input
                type="text"
                placeholder="e.g. family"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-44"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
              <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
                {(["viewer", "editor"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-2.5 py-1 capitalize ${
                      role === r
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => addMember.mutate()}
              disabled={!groupName.trim() || addMember.isPending}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              + Add
            </button>
          </div>
          {addMember.isError && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">{(addMember.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  )
}
