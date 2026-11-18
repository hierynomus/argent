import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { createMetalLotSchema, type MetalPortfolioDetail } from "@argent/shared"
import { metalsApi, useInvalidate } from "../../../api"
import { Field, FieldGroup, Input, SegmentedControl, Select } from "../../../components/ui"
import { capitalize } from "../../../lib/format"
import { useFormErrors } from "../../../lib/validate"
import { FormActions, FormCard } from "../FormCard"

const METALS = ["gold", "silver", "platinum", "palladium"] as const
const FORMS = ["coin", "bar", "other"] as const

const EMPTY = {
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

/** Records a purchase lot: N identical pieces of one metal bought together at one price. */
export function LotForm({ portfolio, onDone }: { portfolio: MetalPortfolioDetail; onDone: () => void }) {
  const invalidate = useInvalidate()
  const [form, setForm] = useState(EMPTY)
  const { errors, check } = useFormErrors()
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const body = () => ({
    purchaseDate: form.purchaseDate,
    metal: form.metal,
    itemName: form.itemName.trim() || undefined,
    itemForm: form.itemForm || undefined,
    unit: form.unit,
    weightPerPiece: form.weightPerPiece,
    quantity: parseInt(form.quantity, 10) || 1,
    pricePerPiece: form.pricePerPiece,
    notes: form.notes.trim() || undefined,
  })

  const save = useMutation({
    mutationFn: () => metalsApi.addLot(portfolio.id, body()),
    onSuccess: () => {
      invalidate.portfolios("metals")
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (check(createMetalLotSchema, body())) save.mutate()
  }

  return (
    <FormCard onSubmit={submit}>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add purchase lot</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Metal">
          <Select required value={form.metal} onChange={set("metal")} className="w-full">
            {METALS.map((m) => (
              <option key={m} value={m}>
                {capitalize(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Item name">
          <Input placeholder="1oz Krugerrand" value={form.itemName} onChange={set("itemName")} className="w-full" />
        </Field>
        <Field label="Form">
          <Select value={form.itemForm} onChange={set("itemForm")} className="w-full">
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {capitalize(f)}
              </option>
            ))}
          </Select>
        </Field>
        <FieldGroup label="Unit">
          <SegmentedControl options={["g", "oz"] as const} value={form.unit} onChange={(unit) => setForm((f) => ({ ...f, unit }))} padding="flex-1 py-1.5 font-medium" />
        </FieldGroup>
        <Field label={`Weight / piece (${form.unit})`} error={errors.weightPerPiece}>
          <Input required type="number" step="any" min="0" placeholder={form.unit === "oz" ? "1" : "31.1"} value={form.weightPerPiece} onChange={set("weightPerPiece")} className="w-full" />
        </Field>
        <Field label="Quantity" error={errors.quantity}>
          <Input required type="number" min="1" step="1" value={form.quantity} onChange={set("quantity")} className="w-full" />
        </Field>
        <Field label={`Price / piece (${portfolio.currency})`} error={errors.pricePerPiece}>
          <Input required type="number" step="any" min="0" placeholder="2000" value={form.pricePerPiece} onChange={set("pricePerPiece")} className="w-full" />
        </Field>
        <Field label="Purchase date" error={errors.purchaseDate}>
          <Input required type="date" value={form.purchaseDate} onChange={set("purchaseDate")} className="w-full" />
        </Field>
        <Field label="Notes">
          <Input placeholder="Optional" value={form.notes} onChange={set("notes")} className="w-full" />
        </Field>
      </div>
      <FormActions submitLabel="Add lot" pending={save.isPending} error={save.error} onCancel={onDone} />
    </FormCard>
  )
}
