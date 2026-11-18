import { Fragment, useState } from "react"
import type { MetalLot } from "@argent/shared"
import { cx } from "../../../components/ui"
import { capitalize, fmtSignificant, fmtSymbolCur, pnlColor, pnlFmt } from "../../../lib/format"
import { SaleForm } from "./SaleForm"

const COLUMNS = 11
const Dash = () => <span className="text-gray-300 dark:text-gray-600">—</span>

/** The physical inventory: one row per purchase lot, with an inline "Sell" form under the lot being sold. */
export function LotsTable({ portfolioId, lots, currency, canEdit }: { portfolioId: string; lots: MetalLot[]; currency: string; canEdit: boolean }) {
  const [sellingId, setSellingId] = useState<string | null>(null)

  return (
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
          {lots.length === 0 && (
            <tr>
              <td colSpan={COLUMNS} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                No lots yet. Add your first purchase below.
              </td>
            </tr>
          )}
          {lots.map((lot) => {
            const selling = sellingId === lot.id
            return (
              <Fragment key={lot.id}>
                <tr className={cx("hover:bg-gray-50 dark:hover:bg-gray-800/50", lot.remainingQuantity === 0 && "opacity-60")}>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                    {lot.itemName ?? <span className="text-gray-400 dark:text-gray-500 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{capitalize(lot.metal)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{lot.itemForm ? capitalize(lot.itemForm) : <Dash />}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{lot.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                    {fmtSignificant(parseFloat(lot.weightPerPiece), 6)} {lot.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">{lot.remainingQuantity}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{fmtSymbolCur(parseFloat(lot.pricePerPiece), currency)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
                    {lot.currentValuePerPiece != null ? fmtSymbolCur(lot.currentValuePerPiece, currency) : <Dash />}
                  </td>
                  <td className={cx("px-4 py-3 text-right font-mono", lot.unrealizedPnL != null ? pnlColor(lot.unrealizedPnL) : "text-gray-300 dark:text-gray-600")}>
                    {lot.unrealizedPnL != null ? pnlFmt(lot.unrealizedPnL, currency) : "—"}
                  </td>
                  <td className={cx("px-4 py-3 text-right font-mono", pnlColor(lot.realizedPnL))}>{pnlFmt(lot.realizedPnL, currency)}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && lot.remainingQuantity > 0 && (
                      <button
                        type="button"
                        onClick={() => setSellingId(selling ? null : lot.id)}
                        className={cx(
                          "px-2 py-1 text-xs rounded font-medium transition-colors",
                          selling
                            ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                            : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40",
                        )}
                      >
                        {selling ? "Cancel" : "Sell"}
                      </button>
                    )}
                  </td>
                </tr>
                {selling && (
                  <tr>
                    <td colSpan={COLUMNS} className="px-4 py-3 bg-red-50 dark:bg-red-900/10 border-t border-red-100 dark:border-red-900/30">
                      <SaleForm portfolioId={portfolioId} lot={lot} currency={currency} onDone={() => setSellingId(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
