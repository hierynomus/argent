import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import type { TransactionFilters, TransactionWithDetails } from "@argent/shared"
import { updateTransaction, useAccounts, useCategories, useInvalidate, useTransactions } from "../api"
import { Pagination } from "../components/Pagination"
import { LoadingText } from "../components/ui"
import { AccountSelector } from "../features/transactions/AccountSelector"
import { BulkActionBar } from "../features/transactions/BulkActionBar"
import { TransactionDetail } from "../features/transactions/TransactionDetail"
import { TransactionFiltersBar } from "../features/transactions/TransactionFiltersBar"
import { TransactionsTable } from "../features/transactions/TransactionsTable"

const PAGE_SIZE = 50

/** The transaction browser: filter by account / text / dates / label, page through, label in bulk, open details. */
export default function OverviewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountId = searchParams.get("account") ?? undefined
  const invalidate = useInvalidate()

  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(() => (initialAccountId ? new Set([initialAccountId]) : new Set()))
  const [filters, setFilters] = useState<TransactionFilters>({ page: 1, pageSize: PAGE_SIZE })
  const [openTx, setOpenTx] = useState<TransactionWithDetails | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: accounts = [] } = useAccounts()
  const { data: labels = [] } = useCategories()
  const accountIds = selectedAccounts.size > 0 ? [...selectedAccounts] : undefined
  const { data, isLoading } = useTransactions({ ...filters, accountIds })
  const rows = data?.data ?? []

  const relabel = useMutation({ mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) => updateTransaction(id, { categoryId }) })

  async function handleLabel(id: string, categoryId: string | null) {
    await relabel.mutateAsync({ id, categoryId })
    invalidate.transactions()
    if (openTx?.id === id) {
      const category = labels.find((l) => l.id === categoryId) ?? null
      setOpenTx((prev) => (prev ? { ...prev, categoryId, category } : null))
    }
  }

  const changeFilters = (patch: Partial<TransactionFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }))
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const toggleAll = () => setSelectedIds(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)))

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

      <TransactionFiltersBar labels={labels} onChange={changeFilters} />

      {isLoading ? (
        <LoadingText />
      ) : (
        <>
          <TransactionsTable
            rows={rows}
            openId={openTx?.id ?? null}
            selectedIds={selectedIds}
            onOpen={setOpenTx}
            onToggle={toggleRow}
            onToggleAll={toggleAll}
            onOpenSubscriptions={() => navigate("/subscriptions")}
          />
          <Pagination page={filters.page ?? 1} pageSize={PAGE_SIZE} total={data?.total ?? 0} noun="transactions" onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </>
      )}

      {openTx && (
        <TransactionDetail
          tx={openTx}
          labels={labels}
          onClose={() => setOpenTx(null)}
          onLabel={handleLabel}
          onTransferChange={(updated) => {
            invalidate.transactions()
            setOpenTx(updated)
          }}
        />
      )}

      <BulkActionBar
        rows={rows}
        selectedIds={selectedIds}
        labels={labels}
        onClear={() => setSelectedIds(new Set())}
        onSubscriptionCreated={() => navigate("/subscriptions")}
      />
    </div>
  )
}
