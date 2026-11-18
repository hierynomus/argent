import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { createMetalSaleSchema, type MetalLot } from "@argent/shared"
import { metalsApi, useInvalidate } from "../../../api"
import { Button, ErrorText, Field, Input } from "../../../components/ui"
import { useFormErrors } from "../../../lib/validate"

const EMPTY = { saleDate: "", quantitySold: "1", totalReceived: "", notes: "" }

/** Inline form (inside the lots table) to record selling some pieces of one lot. */
export function SaleForm({ portfolioId, lot, currency, onDone }: { portfolioId: string; lot: MetalLot; currency: string; onDone: () => void }) {
  const invalidate = useInvalidate()
  const [form, setForm] = useState(EMPTY)
  const { errors, check } = useFormErrors()
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const body = () => ({
    saleDate: form.saleDate,
    quantitySold: parseInt(form.quantitySold, 10),
    totalReceived: form.totalReceived,
    notes: form.notes.trim() || undefined,
  })

  const save = useMutation({
    mutationFn: () => metalsApi.addSale(portfolioId, lot.id, body()),
    onSuccess: () => {
      invalidate.portfolios("metals")
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (check(createMetalSaleSchema, body())) save.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
      <Field label={`Qty to sell (max ${lot.remainingQuantity})`} error={errors.quantitySold}>
        <Input required type="number" min="1" max={lot.remainingQuantity} step="1" value={form.quantitySold} onChange={set("quantitySold")} className="w-24" />
      </Field>
      <Field label={`Total received (${currency})`} error={errors.totalReceived}>
        <Input required type="number" step="any" min="0" placeholder="0.00" value={form.totalReceived} onChange={set("totalReceived")} className="w-32" />
      </Field>
      <Field label="Sale date" error={errors.saleDate}>
        <Input required type="date" value={form.saleDate} onChange={set("saleDate")} />
      </Field>
      <Field label="Notes">
        <Input placeholder="Optional" value={form.notes} onChange={set("notes")} className="w-32" />
      </Field>
      <Button type="submit" size="sm" className="rounded-lg bg-red-600 hover:bg-red-700" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Record sale"}
      </Button>
      <ErrorText error={save.error} />
    </form>
  )
}
