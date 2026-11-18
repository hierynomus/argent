import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { debtApis, useInvalidate, type Debt, type DebtKind } from "../../api"
import { SharingPanel } from "../../components/SharingPanel"
import { Button, ConfirmButton } from "../../components/ui"
import { fmtCur } from "../../lib/format"
import { AddPartForm } from "./AddPartForm"
import { DEBT_KINDS } from "./config"
import { PartRow } from "./PartRow"

const HEADERS: Array<{ label: string; align: "left" | "right" | "none" }> = [
  { label: "Name", align: "left" },
  { label: "Type", align: "left" },
  { label: "Original", align: "right" },
  { label: "Balance", align: "right" },
  { label: "Rate", align: "right" },
  { label: "Monthly", align: "right" },
  { label: "Term", align: "left" },
  { label: "Progress", align: "left" },
  { label: "", align: "none" },
]

/** One mortgage/loan: totals, its parts, sharing (owner only) and add/delete actions. */
export function DebtCard({ kind, debt }: { kind: DebtKind; debt: Debt }) {
  const api = debtApis[kind]
  const { noun } = DEBT_KINDS[kind]
  const invalidate = useInvalidate()
  const [showAddPart, setShowAddPart] = useState(false)
  const [showAccess, setShowAccess] = useState(false)

  const remove = useMutation({ mutationFn: () => api.remove(debt.id), onSuccess: () => invalidate.debts(kind) })
  const refresh = () => invalidate.debts(kind)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{debt.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-400 dark:text-gray-500">{debt.currency}</p>
            {!debt.isOwner && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {debt.canEdit ? "editor" : "viewer"}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCur(debt.totalCurrentBalance, debt.currency)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {fmtCur(debt.totalMonthlyPayment, debt.currency)}
            <span className="text-xs">/mo</span>
          </p>
        </div>
      </div>

      {debt.parts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {HEADERS.map((h, i) => (
                  <th key={i} className={`px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 ${h.align === "right" ? "text-right" : "text-left"}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {debt.parts.map((part) => (
                <PartRow key={part.id} kind={kind} debt={debt} part={part} canEdit={debt.canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {debt.isOwner && showAccess && (
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          <SharingPanel
            members={debt.members}
            onAdd={(m) => api.addMember(debt.id, m).then(refresh)}
            onRemove={(group) => api.removeMember(debt.id, group).then(refresh)}
          />
        </div>
      )}

      {showAddPart ? (
        <AddPartForm kind={kind} debt={debt} onDone={() => setShowAddPart(false)} />
      ) : (
        <div className="px-6 py-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-800 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {debt.canEdit && (
              <Button variant="link" onClick={() => setShowAddPart(true)}>
                + Add part
              </Button>
            )}
            {debt.isOwner && (
              <Button variant="muted-link" onClick={() => setShowAccess((v) => !v)}>
                {showAccess ? "Hide access" : "Share"}
              </Button>
            )}
          </div>
          {debt.isOwner && (
            <div className="flex items-center gap-3">
              <ConfirmButton label={`Delete ${noun}`} prompt={`Delete ${noun}?`} onConfirm={() => remove.mutate()} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
