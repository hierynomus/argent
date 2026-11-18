import { useState } from "react"
import { updateDebtPartSchema } from "@argent/shared"
import { useMutation } from "@tanstack/react-query"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ConfirmButton, ErrorText, Field, Input } from "../../components/ui"
import { fmtCur, fmtMonthYear, fmtRate } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"
import { ExtraPaymentsPanel } from "./ExtraPaymentsPanel"
import { TypeBadge } from "./TypeBadge"

const COLUMNS = 9

/** One part of a mortgage/loan as a table row, plus its optional edit row and extra-payments panel. */
export function PartRow({ kind, debt, part, canEdit }: { kind: DebtKind; debt: Debt; part: DebtPart; canEdit: boolean }) {
  const api = debtApis[kind]
  const invalidate = useInvalidate()
  const [showPayments, setShowPayments] = useState(false)
  const [editing, setEditing] = useState(false)
  // rates are stored as a fraction (0.035) but edited as a percentage (3.5)
  const [form, setForm] = useState({
    name: part.name,
    annualInterestRate: (parseFloat(part.annualInterestRate) * 100).toFixed(4),
    endDate: part.endDate,
  })

  const { errors, check } = useFormErrors()
  const body = () => ({
    name: form.name,
    annualInterestRate: (parseFloat(form.annualInterestRate) / 100).toFixed(6),
    endDate: form.endDate,
  })

  const update = useMutation({
    mutationFn: () => api.updatePart(debt.id, part.id, body()),
    onSuccess: () => {
      invalidate.debts(kind)
      setEditing(false)
    },
  })
  const remove = useMutation({
    mutationFn: () => api.removePart(debt.id, part.id),
    onSuccess: () => invalidate.debts(kind),
  })

  const progressPct = Math.round((part.monthsElapsed / part.totalMonths) * 100)
  const cur = debt.currency

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{part.name}</td>
        <td className="px-4 py-3">
          <TypeBadge type={part.type} />
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtCur(parseFloat(part.principal), cur)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">{fmtCur(part.currentBalance, cur)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">{fmtRate(part.annualInterestRate)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900 dark:text-gray-100">
          <span className="font-medium">{fmtCur(part.monthlyPayment, cur)}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">/mo</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          <span className="text-gray-400 dark:text-gray-500">{fmtMonthYear(part.startDate)}</span>
          {" → "}
          {fmtMonthYear(part.endDate)}
        </td>
        <td className="px-4 py-3 w-32">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{part.monthsRemaining}mo</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button variant="link" size="xs" title="Extra payments" onClick={() => setShowPayments((v) => !v)}>
              {showPayments ? "Hide" : "Payments"}
            </Button>
            {canEdit && (
              <>
                <Button variant="muted-link" size="xs" onClick={() => setEditing((v) => !v)}>
                  Edit
                </Button>
                {/* keyed on `editing` so opening the edit form also dismisses a pending delete confirmation */}
                <ConfirmButton key={String(editing)} label="Delete" onStart={() => setEditing(false)} onConfirm={() => remove.mutate()} />
              </>
            )}
          </div>
        </td>
      </tr>

      {editing && canEdit && (
        <tr className="bg-indigo-50 dark:bg-indigo-950/30">
          <td colSpan={COLUMNS} className="px-4 py-3">
            <div className="flex gap-3 flex-wrap items-end">
              <Field label="Name" error={errors.name}>
                <Input density="sm" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-40" />
              </Field>
              <Field label="Rate (%)" error={errors.annualInterestRate}>
                <Input density="sm" type="number" min="0" step="0.001" value={form.annualInterestRate} onChange={(e) => setForm((f) => ({ ...f, annualInterestRate: e.target.value }))} className="w-24" />
              </Field>
              <Field label="End date" error={errors.endDate}>
                <Input density="sm" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="w-36" />
              </Field>
              <Button disabled={update.isPending} onClick={() => check(updateDebtPartSchema, body()) && update.mutate()}>
                Save
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
            <ErrorText error={update.error} />
          </td>
        </tr>
      )}

      {showPayments && (
        <tr>
          <td colSpan={COLUMNS} className="p-0">
            <ExtraPaymentsPanel kind={kind} debt={debt} part={part} canEdit={canEdit} />
          </td>
        </tr>
      )}
    </>
  )
}
