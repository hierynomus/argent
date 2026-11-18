import { useState } from "react"
import { createDebtExtraPaymentSchema } from "@argent/shared"
import { useMutation } from "@tanstack/react-query"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ErrorText, Field, Input } from "../../components/ui"
import { fmtCur } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"
import { DEBT_KINDS } from "./config"

const EMPTY = { paymentDate: "", amount: "", notes: "" }

/** The extra (early) repayments of one part: list, remove, and a form to record another. */
export function ExtraPaymentsPanel({ kind, debt, part, canEdit }: { kind: DebtKind; debt: Debt; part: DebtPart; canEdit: boolean }) {
  const api = debtApis[kind]
  const invalidate = useInvalidate()
  const [form, setForm] = useState(EMPTY)

  const { errors, check } = useFormErrors()
  const body = () => ({ paymentDate: form.paymentDate, amount: form.amount, notes: form.notes || undefined })

  const add = useMutation({
    mutationFn: () => api.addExtraPayment(debt.id, part.id, body()),
    onSuccess: () => {
      invalidate.debts(kind)
      setForm(EMPTY)
    },
  })
  const remove = useMutation({
    mutationFn: (paymentId: string) => api.removeExtraPayment(debt.id, part.id, paymentId),
    onSuccess: () => invalidate.debts(kind),
  })

  return (
    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Extra payments</p>

      {part.extraPayments.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">No extra payments recorded.</p>
      ) : (
        <table className="w-full text-sm mb-3">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {part.extraPayments.map((ep) => (
              <tr key={ep.id}>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 w-28 whitespace-nowrap">{ep.paymentDate}</td>
                <td className="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                  {fmtCur(parseFloat(ep.amount), debt.currency)}
                </td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 text-xs">{ep.notes ?? ""}</td>
                {canEdit && (
                  <td className="py-1.5 text-right">
                    <Button variant="danger-link" size="xs" onClick={() => remove.mutate(ep.id)}>
                      Remove
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <div className="flex gap-2 flex-wrap items-end">
          <Field label="Date" error={errors.paymentDate}>
            <Input density="sm" type="date" value={form.paymentDate} onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))} className="w-36" />
          </Field>
          <Field label={`Amount (${debt.currency})`} error={errors.amount}>
            <Input density="sm" type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-32" />
          </Field>
          <Field label="Notes (optional)">
            <Input density="sm" type="text" placeholder={DEBT_KINDS[kind].paymentNotesPlaceholder} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-44" />
          </Field>
          <Button disabled={!form.paymentDate || !form.amount || add.isPending} onClick={() => check(createDebtExtraPaymentSchema, body()) && add.mutate()}>
            Add
          </Button>
        </div>
      )}
      <ErrorText error={add.error ?? remove.error} />
    </div>
  )
}
