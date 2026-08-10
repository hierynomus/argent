import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getStockPortfolios,
  getStockPortfolio,
  createStockPortfolio,
  deleteStockPortfolio,
  addStockTrade,
  addStockDividend,
  deleteStockDividend,
  addStockPortfolioMember,
  removeStockPortfolioMember,
  lookupStock,
} from "../api"
import type { StockPosition, StockPortfolioDetail, PortfolioMember, PortfolioWithAccess, StockTrade, StockDividend } from "@argent/shared"

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

export default function StocksPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()

  const { data: portfolios = [], isLoading: loadingList } = useQuery({
    queryKey: ["stock-portfolios"],
    queryFn: () => getStockPortfolios(token),
    enabled: !!token,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeId = selectedId ?? portfolios[0]?.id ?? null

  const { data: portfolio, isLoading: loadingDetail } = useQuery<StockPortfolioDetail>({
    queryKey: ["stock-portfolio", activeId],
    queryFn: () => getStockPortfolio(token, activeId!),
    enabled: !!token && !!activeId,
  })

  const [creatingPortfolio, setCreatingPortfolio] = useState(false)
  const [newPortfolioName, setNewPortfolioName] = useState("")
  const [newPortfolioCurrency, setNewPortfolioCurrency] = useState<"EUR" | "USD">("EUR")
  const [newPortfolioBroker, setNewPortfolioBroker] = useState("")

  async function handleCreatePortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!newPortfolioName.trim()) return
    const created = await createStockPortfolio(token, {
      name: newPortfolioName.trim(),
      currency: newPortfolioCurrency,
      broker: newPortfolioBroker.trim() || undefined,
    })
    qc.invalidateQueries({ queryKey: ["stock-portfolios"] })
    setSelectedId(created.id)
    setNewPortfolioName("")
    setNewPortfolioBroker("")
    setCreatingPortfolio(false)
  }

  if (loadingList) return <p className="text-gray-400 text-sm">Loading…</p>

  if (portfolios.length === 0 && !creatingPortfolio) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Stocks</h1>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-6 py-10 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No stock portfolio yet.</p>
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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Stocks</h1>
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
          <input
            value={newPortfolioBroker}
            onChange={(e) => setNewPortfolioBroker(e.target.value)}
            placeholder="Broker (e.g. DEGIRO)"
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
              {p.broker && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({p.broker})</span>}
            </button>
          ))}
        </div>
      )}

      {loadingDetail && <p className="text-gray-400 text-sm">Loading portfolio…</p>}
      {portfolio && (
        <PortfolioView
          portfolio={portfolio}
          token={token}
          onChanged={() => qc.invalidateQueries({ queryKey: ["stock-portfolio", activeId] })}
          onDeleted={() => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["stock-portfolios"] }) }}
        />
      )}
    </div>
  )
}

// ─── Portfolio detail view ────────────────────────────────────────────────────

const EMPTY_TRADE_FORM = {
  type: "buy" as "buy" | "sell",
  symbol: "",
  assetName: "",
  quantity: "",
  amount: "",
  tradeDate: "",
  notes: "",
}

const EMPTY_DIVIDEND_FORM = {
  symbol: "",
  paymentDate: "",
  amount: "",
  notes: "",
}

function PortfolioView({
  portfolio,
  token,
  onChanged,
  onDeleted,
}: {
  portfolio: StockPortfolioDetail
  token: string
  onChanged: () => void
  onDeleted: () => void
}) {
  const [addingTrade, setAddingTrade] = useState(false)
  const [tradeForm, setTradeForm] = useState(EMPTY_TRADE_FORM)
  const [submittingTrade, setSubmittingTrade] = useState(false)
  const [addingDividend, setAddingDividend] = useState(false)
  const [dividendForm, setDividendForm] = useState(EMPTY_DIVIDEND_FORM)
  const [submittingDividend, setSubmittingDividend] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showDividends, setShowDividends] = useState(false)
  const [symbolUnknown, setSymbolUnknown] = useState(false)

  const cur = portfolio.currency
  const heldPositions = portfolio.positions.filter((p) => p.balance > 1e-10)

  async function handleSymbolBlur() {
    const symbol = tradeForm.symbol.trim()
    if (tradeForm.type !== "buy" || !symbol) {
      setSymbolUnknown(false)
      return
    }
    try {
      const result = await lookupStock(token, symbol)
      setSymbolUnknown(!result.name)
      if (result.name) {
        setTradeForm((f) => (f.assetName.trim() ? f : { ...f, assetName: result.name! }))
      } else {
        setTradeForm((f) => ({ ...f, assetName: "" }))
      }
    } catch {
      // lookup failure isn't necessarily a bad symbol — don't flag it
      setSymbolUnknown(false)
    }
  }

  async function handleAddTrade(e: React.FormEvent) {
    e.preventDefault()
    setSubmittingTrade(true)
    try {
      await addStockTrade(token, portfolio.id, {
        tradeDate: tradeForm.tradeDate,
        type: tradeForm.type,
        symbol: tradeForm.symbol.toUpperCase().trim(),
        quantity: tradeForm.quantity,
        amount: tradeForm.amount,
        assetName: tradeForm.type === "buy" ? (tradeForm.assetName.trim() || undefined) : undefined,
        notes: tradeForm.notes.trim() || undefined,
      })
      onChanged()
      setTradeForm(EMPTY_TRADE_FORM)
      setSymbolUnknown(false)
      setAddingTrade(false)
    } finally {
      setSubmittingTrade(false)
    }
  }

  async function handleAddDividend(e: React.FormEvent) {
    e.preventDefault()
    setSubmittingDividend(true)
    try {
      await addStockDividend(token, portfolio.id, {
        symbol: dividendForm.symbol.toUpperCase().trim(),
        paymentDate: dividendForm.paymentDate,
        amount: dividendForm.amount,
        notes: dividendForm.notes.trim() || undefined,
      })
      onChanged()
      setDividendForm(EMPTY_DIVIDEND_FORM)
      setAddingDividend(false)
    } finally {
      setSubmittingDividend(false)
    }
  }

  return (
    <>
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
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
          {
            label: "Dividends",
            value: fmtCur(portfolio.totalDividends, cur),
            color: portfolio.totalDividends > 0 ? "text-green-600 dark:text-green-400" : undefined,
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
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Symbol</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-right">Shares</th>
              <th className="px-4 py-3 text-right">Avg cost</th>
              <th className="px-4 py-3 text-right">Current</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Unrealized</th>
              <th className="px-4 py-3 text-right">Realized</th>
              <th className="px-4 py-3 text-right">Dividends</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {portfolio.positions.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  No positions yet. Record a buy trade below.
                </td>
              </tr>
            )}
            {portfolio.positions.map((pos: StockPosition) => (
              <tr key={pos.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 font-mono font-semibold text-indigo-700 dark:text-indigo-300">{pos.symbol}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{pos.name}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
                  {pos.balance.toLocaleString("en-US", { maximumFractionDigits: 4 })}
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
                <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                  {pos.totalDividends > 0 ? fmtCur(pos.totalDividends, cur) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add trade / dividend actions */}
      {portfolio.canEdit && !addingTrade && !addingDividend && (
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setAddingTrade(true)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Record trade
          </button>
          <button
            onClick={() => setAddingDividend(true)}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Record dividend
          </button>
        </div>
      )}

      {portfolio.canEdit && addingTrade && (
        <form
          onSubmit={handleAddTrade}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4"
        >
          {/* Direction toggle */}
          <div className="flex gap-2 mb-4">
            {(["buy", "sell"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => { setTradeForm(() => ({ ...EMPTY_TRADE_FORM, type: dir })); setSymbolUnknown(false) }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                  tradeForm.type === dir
                    ? dir === "buy" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Symbol */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Symbol</label>
              {tradeForm.type === "sell" && heldPositions.length > 0 ? (
                <select
                  required
                  value={tradeForm.symbol}
                  onChange={(e) => setTradeForm((f) => ({ ...f, symbol: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Select…</option>
                  {heldPositions.map((p) => (
                    <option key={p.symbol} value={p.symbol}>
                      {p.symbol} ({p.balance.toLocaleString("en-US", { maximumFractionDigits: 4 })})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  placeholder="AAPL"
                  value={tradeForm.symbol}
                  onChange={(e) => { setTradeForm((f) => ({ ...f, symbol: e.target.value })); setSymbolUnknown(false) }}
                  onBlur={handleSymbolBlur}
                  className={`${INPUT} ${symbolUnknown ? "border-orange-400 dark:border-orange-500 focus:ring-orange-400" : ""}`}
                />
              )}
              {symbolUnknown && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Unknown ticker — double check the symbol</p>
              )}
            </div>

            {/* Asset name (buy only) */}
            {tradeForm.type === "buy" && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Name</label>
                <input
                  placeholder="Apple Inc."
                  value={tradeForm.assetName}
                  onChange={(e) => setTradeForm((f) => ({ ...f, assetName: e.target.value }))}
                  className={INPUT}
                />
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {tradeForm.type === "buy" ? "Shares bought" : "Shares sold"}
              </label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="10"
                value={tradeForm.quantity}
                onChange={(e) => setTradeForm((f) => ({ ...f, quantity: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                {cur} {tradeForm.type === "buy" ? "paid" : "received"}
              </label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="1500"
                value={tradeForm.amount}
                onChange={(e) => setTradeForm((f) => ({ ...f, amount: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Date</label>
              <input
                required
                type="date"
                value={tradeForm.tradeDate}
                onChange={(e) => setTradeForm((f) => ({ ...f, tradeDate: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
              <input
                placeholder="Optional"
                value={tradeForm.notes}
                onChange={(e) => setTradeForm((f) => ({ ...f, notes: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={submittingTrade}
              className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg"
            >
              {submittingTrade ? "Saving…" : "Save trade"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingTrade(false); setTradeForm(EMPTY_TRADE_FORM); setSymbolUnknown(false) }}
              className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {portfolio.canEdit && addingDividend && (
        <form
          onSubmit={handleAddDividend}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Symbol</label>
              {heldPositions.length > 0 ? (
                <select
                  required
                  value={dividendForm.symbol}
                  onChange={(e) => setDividendForm((f) => ({ ...f, symbol: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Select…</option>
                  {heldPositions.map((p) => (
                    <option key={p.symbol} value={p.symbol}>{p.symbol}</option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  placeholder="AAPL"
                  value={dividendForm.symbol}
                  onChange={(e) => setDividendForm((f) => ({ ...f, symbol: e.target.value }))}
                  className={INPUT}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{cur} received</label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="25.00"
                value={dividendForm.amount}
                onChange={(e) => setDividendForm((f) => ({ ...f, amount: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Payment date</label>
              <input
                required
                type="date"
                value={dividendForm.paymentDate}
                onChange={(e) => setDividendForm((f) => ({ ...f, paymentDate: e.target.value }))}
                className={INPUT}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
              <input
                placeholder="Optional"
                value={dividendForm.notes}
                onChange={(e) => setDividendForm((f) => ({ ...f, notes: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={submittingDividend}
              className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg"
            >
              {submittingDividend ? "Saving…" : "Save dividend"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingDividend(false); setDividendForm(EMPTY_DIVIDEND_FORM) }}
              className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Trade history */}
      {portfolio.trades.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
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
                  {[...portfolio.trades].reverse().map((t: StockTrade) => {
                    const isBuy = t.fromSymbol === cur
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{t.tradeDate}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            isBuy ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          }`}>
                            {isBuy ? "Buy" : "Sell"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                          {parseFloat(t.fromAmount).toLocaleString("en-US", { maximumFractionDigits: 4 })} {t.fromSymbol}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-gray-700 dark:text-gray-300">
                          {parseFloat(t.toAmount).toLocaleString("en-US", { maximumFractionDigits: 4 })} {t.toSymbol}
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

      {/* Dividend history */}
      {portfolio.dividends.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDividends((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span>Dividend history ({portfolio.dividends.length})</span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={`transition-transform ${showDividends ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showDividends && (
            <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-800">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Symbol</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Notes</th>
                    {portfolio.canEdit && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {[...portfolio.dividends].reverse().map((d: StockDividend) => (
                    <DividendRow key={d.id} dividend={d} portfolioId={portfolio.id} token={token} currency={cur} canEdit={portfolio.canEdit} onDeleted={onChanged} />
                  ))}
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

function DividendRow({
  dividend,
  portfolioId,
  token,
  currency,
  canEdit,
  onDeleted,
}: {
  dividend: StockDividend
  portfolioId: string
  token: string
  currency: string
  canEdit: boolean
  onDeleted: () => void
}) {
  const del = useMutation({
    mutationFn: () => deleteStockDividend(token, portfolioId, dividend.id),
    onSuccess: onDeleted,
  })

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{dividend.paymentDate}</td>
      <td className="px-4 py-2 font-mono font-medium text-indigo-700 dark:text-indigo-300">{dividend.symbol}</td>
      <td className="px-4 py-2 text-right font-mono text-green-600 dark:text-green-400">
        +{fmtCur(parseFloat(dividend.amount), currency)}
      </td>
      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{dividend.notes ?? ""}</td>
      {canEdit && (
        <td className="px-4 py-2 text-right">
          <button
            onClick={() => del.mutate()}
            disabled={del.isPending}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
          >
            Delete
          </button>
        </td>
      )}
    </tr>
  )
}

// ─── Portfolio actions (owner: share + delete) ────────────────────────────────

function PortfolioActions({
  portfolio,
  token,
  onDeleted,
}: {
  portfolio: StockPortfolioDetail
  token: string
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [showAccess, setShowAccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")

  const addMember = useMutation({
    mutationFn: () => addStockPortfolioMember(token, portfolio.id, { groupName: groupName.trim(), role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-portfolio", portfolio.id] })
      qc.invalidateQueries({ queryKey: ["stock-portfolios"] })
      setGroupName("")
    },
  })

  const removeMember = useMutation({
    mutationFn: (gn: string) => removeStockPortfolioMember(token, portfolio.id, gn),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-portfolio", portfolio.id] })
      qc.invalidateQueries({ queryKey: ["stock-portfolios"] })
    },
  })

  const deletePortfolio = useMutation({
    mutationFn: () => deleteStockPortfolio(token, portfolio.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-portfolios"] })
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
