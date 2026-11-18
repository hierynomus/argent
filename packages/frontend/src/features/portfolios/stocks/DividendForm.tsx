import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { createStockDividendSchema, type StockPortfolioDetail } from "@argent/shared"
import { stocksApi, useInvalidate } from "../../../api"
import { Field, Input, Select } from "../../../components/ui"
import { useFormErrors } from "../../../lib/validate"
import { FormActions, FormCard } from "../FormCard"

const EMPTY = { symbol: "", paymentDate: "", amount: "", notes: "" }

/** Records a dividend payment. Dividends are income only: they don't change cost basis. */
export function DividendForm({ portfolio, onDone }: { portfolio: StockPortfolioDetail; onDone: () => void }) {
  const invalidate = useInvalidate()
  const [form, setForm] = useState(EMPTY)
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const { errors, check } = useFormErrors()
  const held = portfolio.positions.filter((p) => p.balance > 1e-10)

  const body = () => ({
    symbol: form.symbol.toUpperCase().trim(),
    paymentDate: form.paymentDate,
    amount: form.amount,
    notes: form.notes.trim() || undefined,
  })

  const save = useMutation({
    mutationFn: () => stocksApi.addDividend(portfolio.id, body()),
    onSuccess: () => {
      invalidate.portfolios("stocks")
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (check(createStockDividendSchema, body())) save.mutate()
  }

  return (
    <FormCard onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Symbol" error={errors.symbol}>
          {held.length > 0 ? (
            <Select required value={form.symbol} onChange={set("symbol")} className="w-full">
              <option value="">Select…</option>
              {held.map((p) => (
                <option key={p.symbol} value={p.symbol}>
                  {p.symbol}
                </option>
              ))}
            </Select>
          ) : (
            <Input required placeholder="AAPL" value={form.symbol} onChange={set("symbol")} className="w-full" />
          )}
        </Field>
        <Field label={`${portfolio.currency} received`} error={errors.amount}>
          <Input required type="number" step="any" min="0" placeholder="25.00" value={form.amount} onChange={set("amount")} className="w-full" />
        </Field>
        <Field label="Payment date" error={errors.paymentDate}>
          <Input required type="date" value={form.paymentDate} onChange={set("paymentDate")} className="w-full" />
        </Field>
        <Field label="Notes">
          <Input placeholder="Optional" value={form.notes} onChange={set("notes")} className="w-full" />
        </Field>
      </div>
      <FormActions submitLabel="Save dividend" pending={save.isPending} error={save.error} onCancel={onDone} />
    </FormCard>
  )
}
