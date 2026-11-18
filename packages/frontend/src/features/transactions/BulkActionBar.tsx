import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { Category, TransactionWithDetails } from "@argent/shared"
import { createSubscription, updateTransaction, useInvalidate } from "../../api"
import { Button, ErrorText, Input, Select } from "../../components/ui"

/**
 * If every selected transaction is a (non-transfer) payment to the same counterparty on the same
 * account, that pair is what a subscription would be created for; otherwise there is no target.
 */
export function subscriptionTargetOf(rows: TransactionWithDetails[], selected: ReadonlySet<string>) {
  const eligible = rows.filter((r) => selected.has(r.id) && r.counterpartyIban && !r.transferPeerId)
  if (eligible.length === 0) return null
  const first = eligible[0]
  const same = eligible.every((r) => r.accountId === first.accountId && r.counterpartyIban === first.counterpartyIban)
  if (!same) return null
  return { accountId: first.accountId, counterpartyIban: first.counterpartyIban!, counterpartyName: first.counterpartyName }
}

/** Floating bar shown while rows are selected: apply a label to all of them, or turn them into a subscription. */
export function BulkActionBar({
  rows,
  selectedIds,
  labels,
  onClear,
  onSubscriptionCreated,
}: {
  rows: TransactionWithDetails[]
  selectedIds: ReadonlySet<string>
  labels: Category[]
  onClear: () => void
  onSubscriptionCreated: () => void
}) {
  const invalidate = useInvalidate()
  const [labelId, setLabelId] = useState("")
  const [creatingSub, setCreatingSub] = useState(false)
  const [subName, setSubName] = useState("")

  const target = subscriptionTargetOf(rows, selectedIds)

  const applyLabel = useMutation({
    mutationFn: async () => {
      for (const id of selectedIds) await updateTransaction(id, { categoryId: labelId || null })
    },
    onSuccess: () => {
      invalidate.transactions()
      onClear()
    },
  })

  const createSub = useMutation({
    mutationFn: () => createSubscription({ accountId: target!.accountId, counterpartyIban: target!.counterpartyIban, name: subName.trim() || undefined }),
    onSuccess: () => {
      setCreatingSub(false)
      setSubName("")
      onClear()
      onSubscriptionCreated()
    },
  })

  if (selectedIds.size === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-5 py-3">
      <div className="flex items-center gap-3">
        {creatingSub && target ? (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">↻ {target.counterpartyName ?? target.counterpartyIban}</span>
            <Input
              autoFocus
              density="sm"
              type="text"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="Name (optional)"
              aria-label="Subscription name"
              onKeyDown={(e) => {
                if (e.key === "Enter") createSub.mutate()
                if (e.key === "Escape") setCreatingSub(false)
              }}
              className="!py-1.5 w-40"
            />
            <Button size="sm" className="rounded-md" disabled={createSub.isPending} onClick={() => createSub.mutate()}>
              {createSub.isPending ? "Creating…" : "Create"}
            </Button>
            <Button variant="muted-link" size="sm" className="!px-2" onClick={() => setCreatingSub(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{selectedIds.size} selected</span>
            <Select density="sm" aria-label="Label to apply" value={labelId} onChange={(e) => setLabelId(e.target.value)} className="!py-1.5">
              <option value="">Unlabeled</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Button size="sm" className="rounded-md" disabled={applyLabel.isPending} onClick={() => applyLabel.mutate()}>
              {applyLabel.isPending ? "Applying…" : "Apply label"}
            </Button>
            {target && (
              <>
                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
                <Button variant="secondary" className="rounded-md whitespace-nowrap font-medium" onClick={() => setCreatingSub(true)}>
                  ↻ Create subscription
                </Button>
              </>
            )}
            <Button variant="muted-link" size="sm" className="!px-2" onClick={onClear}>
              Clear
            </Button>
          </>
        )}
      </div>
      <ErrorText error={applyLabel.error ?? createSub.error} />
    </div>
  )
}
