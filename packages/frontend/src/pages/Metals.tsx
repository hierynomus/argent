import { useState, Fragment } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getMetalPortfolios,
  getMetalPortfolio,
  createMetalPortfolio,
  deleteMetalPortfolio,
  addMetalLot,
  addMetalSale,
  addMetalPortfolioMember,
  removeMetalPortfolioMember,
} from "../api"
import type { MetalLot, MetalPortfolioDetail, PortfolioMember, PortfolioWithAccess } from "@argent/shared"

const METALS = ["gold", "silver", "platinum", "palladium"] as const
const FORMS = ["coin", "bar", "other"] as const

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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const INPUT = "w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
const SMALL_INPUT = "px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

export default function MetalsPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()

  const { data: portfolios = [], isLoading: loadingList } = useQuery({
    queryKey: ["metal-portfolios"],
    queryFn: () => getMetalPortfolios(token),
    enabled: !!token,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeId = selectedId ?? portfolios[0]?.id ?? null

  const { data: portfolio, isLoading: loadingDetail } = useQuery<MetalPortfolioDetail>({
    queryKey: ["metal-portfolio", activeId],
    queryFn: () => getMetalPortfolio(token, activeId!),
    enabled: !!token && !!activeId,
  })

  const [creatingPortfolio, setCreatingPortfolio] = useState(false)
  const [newPortfolioName, setNewPortfolioName] = useState("")
  const [newPortfolioCurrency, setNewPortfolioCurrency] = useState<"EUR" | "USD">("EUR")

  async function handleCreatePortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!newPortfolioName.trim()) return
    const created = await createMetalPortfolio(token, { name: newPortfolioName.trim(), currency: newPortfolioCurrency })
    qc.invalidateQueries({ queryKey: ["metal-portfolios"] })
    setSelectedId(created.id)
    setNewPortfolioName("")
    setCreatingPortfolio(false)
  }

  if (loadingList) return <p className="text-gray-400 text-sm">Loading…</p>

  if (portfolios.length === 0 && !creatingPortfolio) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Precious Metals</h1>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-6 py-10 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No metals portfolio yet.</p>
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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Precious Metals</h1>
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
          onUpdated={() => qc.invalidateQueries({ queryKey: ["metal-portfolio", activeId] })}
          onDeleted={() => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["metal-portfolios"] }) }}
        />
      )}
    </div>
  )
}

// ─── Portfolio detail view ────────────────────────────────────────────────────

const EMPTY_LOT_FORM = {
  purchaseDate: "",
  metal: "gold" as string,
  itemName: "",
  itemForm: "coin" as string,
  unit: "g" as "g" | "oz",
  weightPerPiece: "",
  quantity: "1",
  pricePerPiece: "",
  notes: "",
}

const EMPTY_SALE_FORM = {
  saleDate: "",
  quantitySold: "1",
  totalReceived: "",
  notes: "",
}

function PortfolioView({
  portfolio,
  token,
  onUpdated,
  onDeleted,
}: {
  portfolio: MetalPortfolioDetail
  token: string
  onUpdated: () => void
  onDeleted: () => void
}) {
  const [addingLot, setAddingLot] = useState(false)
  const [lotForm, setLotForm] = useState(EMPTY_LOT_FORM)
  const [submittingLot, setSubmittingLot] = useState(false)
  const [sellingLotId, setSellingLotId] = useState<string | null>(null)
  const [saleForm, setSaleForm] = useState(EMPTY_SALE_FORM)
  const [submittingSale, setSubmittingSale] = useState(false)

  const cur = portfolio.currency
  const sellingLot = portfolio.lots.find((l) => l.id === sellingLotId) ?? null

  async function handleAddLot(e: React.FormEvent) {
    e.preventDefault()
    setSubmittingLot(true)
    try {
      await addMetalLot(token, portfolio.id, {
        purchaseDate: lotForm.purchaseDate,
        metal: lotForm.metal,
        itemName: lotForm.itemName.trim() || undefined,
        itemForm: lotForm.itemForm || undefined,
        unit: lotForm.unit,
        weightPerPiece: lotForm.weightPerPiece,
        quantity: parseInt(lotForm.quantity, 10) || 1,
        pricePerPiece: lotForm.pricePerPiece,
        notes: lotForm.notes.trim() || undefined,
      })
      onUpdated()
      setLotForm(EMPTY_LOT_FORM)
      setAddingLot(false)
    } finally {
      setSubmittingLot(false)
    }
  }

  async function handleAddSale(e: React.FormEvent) {
    e.preventDefault()
    if (!sellingLotId) return
    setSubmittingSale(true)
    try {
      await addMetalSale(token, portfolio.id, sellingLotId, {
        saleDate: saleForm.saleDate,
        quantitySold: parseInt(saleForm.quantitySold, 10),
        totalReceived: saleForm.totalReceived,
        notes: saleForm.notes.trim() || undefined,
      })
      onUpdated()
      setSaleForm(EMPTY_SALE_FORM)
      setSellingLotId(null)
    } finally {
      setSubmittingSale(false)
    }
  }

  return (
    <>
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Open cost", value: fmtCur(portfolio.totalInvestedOpen, cur) },
          {
            label: "Current value",
            value: portfolio.totalCurrentValueOpen != null ? fmtCur(portfolio.totalCurrentValueOpen, cur) : "—",
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

      {/* Lots inventory table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Metal</th>
              <th className="px-4 py-3 text-left">Form</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Weight/pc</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3 text-right">Cost/pc</th>
              <th className="px-4 py-3 text-right">Value/pc</th>
              <th className="px-4 py-3 text-right">Unr. P&L</th>
              <th className="px-4 py-3 text-right">Real. P&L</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {portfolio.lots.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  No lots yet. Add your first purchase below.
                </td>
              </tr>
            )}
            {portfolio.lots.map((lot: MetalLot) => {
              const weightLabel = `${parseFloat(lot.weightPerPiece).toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${lot.unit}`
              const isSelling = sellingLotId === lot.id
              return (
                <Fragment key={lot.id}>
                  <tr className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${lot.remainingQuantity === 0 ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                      {lot.itemName ?? <span className="text-gray-400 dark:text-gray-500 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{capitalize(lot.metal)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {lot.itemForm ? capitalize(lot.itemForm) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{lot.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{weightLabel}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">{lot.remainingQuantity}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                      {fmtCur(parseFloat(lot.pricePerPiece), cur)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                      {lot.currentValuePerPiece != null
                        ? fmtCur(lot.currentValuePerPiece, cur)
                        : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${lot.unrealizedPnL != null ? pnlColor(lot.unrealizedPnL) : "text-gray-300 dark:text-gray-600"}`}>
                      {lot.unrealizedPnL != null ? pnlFmt(lot.unrealizedPnL, cur) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${pnlColor(lot.realizedPnL)}`}>
                      {pnlFmt(lot.realizedPnL, cur)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {portfolio.canEdit && lot.remainingQuantity > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isSelling) {
                              setSellingLotId(null)
                            } else {
                              setSellingLotId(lot.id)
                              setSaleForm(EMPTY_SALE_FORM)
                            }
                          }}
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            isSelling
                              ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                              : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                          }`}
                        >
                          {isSelling ? "Cancel" : "Sell"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isSelling && sellingLot && (
                    <tr>
                      <td colSpan={11} className="px-4 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
                        <form onSubmit={handleAddSale} className="flex flex-wrap gap-3 items-end">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                              Qty to sell (max {sellingLot.remainingQuantity})
                            </label>
                            <input
                              required
                              type="number"
                              min="1"
                              max={sellingLot.remainingQuantity}
                              step="1"
                              value={saleForm.quantitySold}
                              onChange={(e) => setSaleForm((f) => ({ ...f, quantitySold: e.target.value }))}
                              className={`w-24 ${SMALL_INPUT}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                              Total received ({cur})
                            </label>
                            <input
                              required
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0.00"
                              value={saleForm.totalReceived}
                              onChange={(e) => setSaleForm((f) => ({ ...f, totalReceived: e.target.value }))}
                              className={`w-32 ${SMALL_INPUT}`}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sale date</label>
                            <input
                              required
                              type="date"
                              value={saleForm.saleDate}
                              onChange={(e) => setSaleForm((f) => ({ ...f, saleDate: e.target.value }))}
                              className={SMALL_INPUT}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
                            <input
                              placeholder="Optional"
                              value={saleForm.notes}
                              onChange={(e) => setSaleForm((f) => ({ ...f, notes: e.target.value }))}
                              className={`w-32 ${SMALL_INPUT}`}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={submittingSale}
                            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg"
                          >
                            {submittingSale ? "Saving…" : "Record sale"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add lot */}
      {portfolio.canEdit && !addingLot ? (
        <button
          onClick={() => setAddingLot(true)}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-4"
        >
          + Add lot
        </button>
      ) : portfolio.canEdit && (
        <form
          onSubmit={handleAddLot}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4"
        >
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add purchase lot</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Metal */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Metal</label>
              <select
                required
                value={lotForm.metal}
                onChange={(e) => setLotForm((f) => ({ ...f, metal: e.target.value }))}
                className={INPUT}
              >
                {METALS.map((m) => (
                  <option key={m} value={m}>{capitalize(m)}</option>
                ))}
              </select>
            </div>

            {/* Item name */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Item name</label>
              <input
                placeholder="1oz Krugerrand"
                value={lotForm.itemName}
                onChange={(e) => setLotForm((f) => ({ ...f, itemName: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Form */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Form</label>
              <select
                value={lotForm.itemForm}
                onChange={(e) => setLotForm((f) => ({ ...f, itemForm: e.target.value }))}
                className={INPUT}
              >
                {FORMS.map((f) => (
                  <option key={f} value={f}>{capitalize(f)}</option>
                ))}
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Unit</label>
              <div className="flex rounded overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
                {(["g", "oz"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setLotForm((f) => ({ ...f, unit: u }))}
                    className={`flex-1 py-1.5 font-medium transition-colors ${
                      lotForm.unit === u
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Weight per piece */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                Weight / piece ({lotForm.unit})
              </label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder={lotForm.unit === "oz" ? "1" : "31.1"}
                value={lotForm.weightPerPiece}
                onChange={(e) => setLotForm((f) => ({ ...f, weightPerPiece: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Quantity</label>
              <input
                required
                type="number"
                min="1"
                step="1"
                value={lotForm.quantity}
                onChange={(e) => setLotForm((f) => ({ ...f, quantity: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Price per piece */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                Price / piece ({cur})
              </label>
              <input
                required
                type="number"
                step="any"
                min="0"
                placeholder="2000"
                value={lotForm.pricePerPiece}
                onChange={(e) => setLotForm((f) => ({ ...f, pricePerPiece: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Date */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Purchase date</label>
              <input
                required
                type="date"
                value={lotForm.purchaseDate}
                onChange={(e) => setLotForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className={INPUT}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Notes</label>
              <input
                placeholder="Optional"
                value={lotForm.notes}
                onChange={(e) => setLotForm((f) => ({ ...f, notes: e.target.value }))}
                className={INPUT}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="submit"
              disabled={submittingLot}
              className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg"
            >
              {submittingLot ? "Saving…" : "Add lot"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingLot(false); setLotForm(EMPTY_LOT_FORM) }}
              className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Share & delete (owner-only) */}
      {portfolio.isOwner && (
        <MetalPortfolioActions portfolio={portfolio} token={token} onDeleted={onDeleted} />
      )}
    </>
  )
}

// ─── Portfolio actions (owner: share + delete) ────────────────────────────────

function MetalPortfolioActions({
  portfolio,
  token,
  onDeleted,
}: {
  portfolio: MetalPortfolioDetail
  token: string
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const [showAccess, setShowAccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")

  const addMember = useMutation({
    mutationFn: () => addMetalPortfolioMember(token, portfolio.id, { groupName: groupName.trim(), role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal-portfolio", portfolio.id] })
      qc.invalidateQueries({ queryKey: ["metal-portfolios"] })
      setGroupName("")
    },
  })

  const removeMember = useMutation({
    mutationFn: (gn: string) => removeMetalPortfolioMember(token, portfolio.id, gn),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal-portfolio", portfolio.id] })
      qc.invalidateQueries({ queryKey: ["metal-portfolios"] })
    },
  })

  const deletePortfolio = useMutation({
    mutationFn: () => deleteMetalPortfolio(token, portfolio.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal-portfolios"] })
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
