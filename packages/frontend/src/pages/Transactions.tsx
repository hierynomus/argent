import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getTransactions, getCategories, updateTransaction } from "../api"
import type { TransactionFilters, TransactionWithDetails } from "@argent/shared"

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

export default function TransactionsPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()

  const [filters, setFilters] = useState<TransactionFilters>({
    page: 1,
    pageSize: PAGE_SIZE,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => getTransactions(token, filters),
  })

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(token),
  })

  const categorize = useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      updateTransaction(token, id, { categoryId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  })

  const inputCls = "border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Transactions</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search description…"
          className={`${inputCls} w-60`}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
          }
        />
        <input
          type="date"
          className={inputCls}
          onChange={(e) =>
            setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))
          }
        />
        <input
          type="date"
          className={inputCls}
          onChange={(e) =>
            setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))
          }
        />
        <select
          className={inputCls}
          onChange={(e) =>
            setFilters((f) => ({ ...f, categoryId: e.target.value || undefined, page: 1 }))
          }
        >
          <option value="">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories?.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-gray-400 dark:text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data?.data.map((tx: TransactionWithDetails) => (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {tx.bookingDate}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100 max-w-[160px] truncate">
                      {tx.counterpartyName ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[280px] truncate">
                      {tx.description ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${
                        tx.creditDebitIndicator === "CRDT"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        value={tx.categoryId ?? ""}
                        onChange={(e) =>
                          categorize.mutate({
                            id: tx.id,
                            categoryId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Uncategorized</option>
                        {categories?.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500 dark:text-gray-400">
            <span>
              {data?.total ?? 0} transactions
            </span>
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
                disabled={
                  (data?.total ?? 0) <= (filters.page ?? 1) * PAGE_SIZE
                }
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
