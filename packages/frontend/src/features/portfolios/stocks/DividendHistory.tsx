import { useMutation } from "@tanstack/react-query"
import type { StockDividend } from "@argent/shared"
import { stocksApi, useInvalidate } from "../../../api"
import { Button } from "../../../components/ui"
import { fmtSymbolCur } from "../../../lib/format"
import { Collapsible } from "../Collapsible"

function DividendRow({ dividend, currency, canEdit }: { dividend: StockDividend; currency: string; canEdit: boolean }) {
  const invalidate = useInvalidate()
  const remove = useMutation({
    mutationFn: () => stocksApi.removeDividend(dividend.portfolioId, dividend.id),
    onSuccess: () => invalidate.portfolios("stocks"),
  })
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{dividend.paymentDate}</td>
      <td className="px-4 py-2 font-mono font-medium text-indigo-700 dark:text-indigo-300">{dividend.symbol}</td>
      <td className="px-4 py-2 text-right font-mono text-green-600 dark:text-green-400">+{fmtSymbolCur(parseFloat(dividend.amount), currency)}</td>
      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{dividend.notes ?? ""}</td>
      {canEdit && (
        <td className="px-4 py-2 text-right">
          <Button variant="danger-link" size="xs" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Delete
          </Button>
        </td>
      )}
    </tr>
  )
}

/** Collapsible, newest-first list of dividend payments. Unlike trades, dividends can be deleted. */
export function DividendHistory({ dividends, currency, canEdit }: { dividends: StockDividend[]; currency: string; canEdit: boolean }) {
  if (dividends.length === 0) return null
  return (
    <Collapsible title={`Dividend history (${dividends.length})`}>
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-left">Symbol</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2 text-left">Notes</th>
            {canEdit && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {[...dividends].reverse().map((d) => (
            <DividendRow key={d.id} dividend={d} currency={currency} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </Collapsible>
  )
}
