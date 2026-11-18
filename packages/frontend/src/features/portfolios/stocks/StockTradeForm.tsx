import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { createStockTradeSchema, type StockPortfolioDetail } from "@argent/shared"
import { stocksApi, useInvalidate } from "../../../api"
import { Field, Input, Select, cx } from "../../../components/ui"
import { fmtMaxDecimals } from "../../../lib/format"
import { useFormErrors } from "../../../lib/validate"
import { FormActions, FormCard } from "../FormCard"
import { TradeKindToggle } from "../TradeKindToggle"

type Kind = "buy" | "sell"
const KINDS = ["buy", "sell"] as const
const EMPTY = { symbol: "", assetName: "", quantity: "", amount: "", tradeDate: "", notes: "" }

/** Records a buy or sell. When buying, leaving the ticker field looks the company name up and fills it in. */
export function StockTradeForm({ portfolio, onDone }: { portfolio: StockPortfolioDetail; onDone: () => void }) {
  const invalidate = useInvalidate()
  const cur = portfolio.currency
  const [kind, setKind] = useState<Kind>("buy")
  const [form, setForm] = useState(EMPTY)
  const [symbolUnknown, setSymbolUnknown] = useState(false)
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const { errors, check } = useFormErrors()
  const held = portfolio.positions.filter((p) => p.balance > 1e-10)

  const body = () => ({
    tradeDate: form.tradeDate,
    type: kind,
    symbol: form.symbol.toUpperCase().trim(),
    quantity: form.quantity,
    amount: form.amount,
    assetName: kind === "buy" ? form.assetName.trim() || undefined : undefined,
    notes: form.notes.trim() || undefined,
  })

  const save = useMutation({
    mutationFn: () => stocksApi.addTrade(portfolio.id, body()),
    onSuccess: () => {
      invalidate.portfolios("stocks")
      onDone()
    },
  })

  async function lookupSymbol() {
    const symbol = form.symbol.trim()
    if (kind !== "buy" || !symbol) return setSymbolUnknown(false)
    try {
      const result = await stocksApi.lookup(symbol)
      setSymbolUnknown(!result.name)
      // never overwrite a name the user typed; clear a stale one when the ticker is unknown
      setForm((f) => (result.name ? (f.assetName.trim() ? f : { ...f, assetName: result.name! }) : { ...f, assetName: "" }))
    } catch {
      // a failed lookup is not evidence of a bad symbol — don't flag it
      setSymbolUnknown(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (check(createStockTradeSchema, body())) save.mutate()
  }

  return (
    <FormCard onSubmit={submit}>
      <TradeKindToggle options={KINDS} value={kind} onChange={(k) => { setKind(k); setForm(EMPTY); setSymbolUnknown(false) }} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <Field label="Symbol" error={errors.symbol}>
            {kind === "sell" && held.length > 0 ? (
              <Select required value={form.symbol} onChange={set("symbol")} className="w-full">
                <option value="">Select…</option>
                {held.map((p) => (
                  <option key={p.symbol} value={p.symbol}>
                    {p.symbol} ({fmtMaxDecimals(p.balance, 4)})
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                required
                placeholder="AAPL"
                value={form.symbol}
                onChange={(e) => { set("symbol")(e); setSymbolUnknown(false) }}
                onBlur={lookupSymbol}
                className={cx("w-full", symbolUnknown && "border-orange-400 dark:border-orange-500 focus:ring-orange-400")}
              />
            )}
          </Field>
          {symbolUnknown && <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Unknown ticker — double check the symbol</p>}
        </div>

        {kind === "buy" && (
          <Field label="Name">
            <Input placeholder="Apple Inc." value={form.assetName} onChange={set("assetName")} className="w-full" />
          </Field>
        )}

        <Field label={kind === "buy" ? "Shares bought" : "Shares sold"} error={errors.quantity}>
          <Input required type="number" step="any" min="0" placeholder="10" value={form.quantity} onChange={set("quantity")} className="w-full" />
        </Field>
        <Field label={`${cur} ${kind === "buy" ? "paid" : "received"}`} error={errors.amount}>
          <Input required type="number" step="any" min="0" placeholder="1500" value={form.amount} onChange={set("amount")} className="w-full" />
        </Field>
        <Field label="Date" error={errors.tradeDate}>
          <Input required type="date" value={form.tradeDate} onChange={set("tradeDate")} className="w-full" />
        </Field>
        <Field label="Notes">
          <Input placeholder="Optional" value={form.notes} onChange={set("notes")} className="w-full" />
        </Field>
      </div>

      <FormActions submitLabel="Save trade" pending={save.isPending} error={save.error} onCancel={onDone} />
    </FormCard>
  )
}
