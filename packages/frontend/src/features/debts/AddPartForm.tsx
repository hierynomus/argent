import { useState } from "react"
import { createDebtPartSchema } from "@argent/shared"
import { useMutation } from "@tanstack/react-query"
import { debtApis, useInvalidate, type Debt, type DebtKind, type DebtPart } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, SegmentedControl } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { DEBT_KINDS } from "./config"
import { PART_TYPE_LABELS } from "./TypeBadge"

type PartType = DebtPart["type"]
const TYPE_OPTIONS = (Object.keys(PART_TYPE_LABELS) as PartType[]).map((value) => ({ value, label: PART_TYPE_LABELS[value] }))

/** Form to add a part (a loan tranche with its own rate, term and repayment type). */
export function AddPartForm({ kind, debt, onDone }: { kind: DebtKind; debt: Debt; onDone: () => void }) {
  const invalidate = useInvalidate()
  const hints = DEBT_KINDS[kind].part
  const [form, setForm] = useState({ name: "", type: "annuity" as PartType, principal: "", annualInterestRate: "", startDate: "", endDate: "" })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const { errors, check } = useFormErrors()

  // the rate is entered as a percentage but sent as a fraction
  const body = () => ({
    name: form.name,
    type: form.type,
    principal: form.principal,
    annualInterestRate: (parseFloat(form.annualInterestRate) / 100).toFixed(6),
    startDate: form.startDate,
    endDate: form.endDate,
  })

  const add = useMutation({
    mutationFn: () => debtApis[kind].addPart(debt.id, body()),
    onSuccess: () => {
      invalidate.debts(kind)
      onDone()
    },
  })

  const submit = () => check(createDebtPartSchema, body()) && add.mutate()
  const complete = form.name && form.principal && form.annualInterestRate && form.startDate && form.endDate

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 px-6 py-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add part</p>
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Name" error={errors.name}>
          <Input type="text" placeholder={hints.namePlaceholder} value={form.name} onChange={(e) => set("name", e.target.value)} className="w-36" />
        </Field>
        <FieldGroup label="Type">
          <SegmentedControl options={TYPE_OPTIONS} value={form.type} onChange={(v) => set("type", v)} padding="px-2 py-1.5" />
        </FieldGroup>
        <Field label={`Principal (${debt.currency})`} error={errors.principal}>
          <Input type="number" min="0" step={hints.principalStep} placeholder={hints.principalPlaceholder} value={form.principal} onChange={(e) => set("principal", e.target.value)} className="w-32" />
        </Field>
        <Field label="Rate (%/yr)" error={errors.annualInterestRate}>
          <Input type="number" min="0" step="0.001" placeholder={hints.ratePlaceholder} value={form.annualInterestRate} onChange={(e) => set("annualInterestRate", e.target.value)} className="w-24" />
        </Field>
        <Field label="Start date" error={errors.startDate}>
          <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="w-36" />
        </Field>
        <Field label="End date" error={errors.endDate}>
          <Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="w-36" />
        </Field>
        <Button disabled={!complete || add.isPending} onClick={submit}>
          {add.isPending ? "Adding…" : "Add part"}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText error={add.error} />
    </div>
  )
}
