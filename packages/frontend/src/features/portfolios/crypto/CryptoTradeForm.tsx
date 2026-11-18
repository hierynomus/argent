import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { createCryptoTradeSchema, type CreateCryptoTradeBody, type PortfolioDetail } from "@argent/shared"
import { cryptoApi, useInvalidate } from "../../../api"
import { Field, Input, Select } from "../../../components/ui"
import { fmtSignificant } from "../../../lib/format"
import { useFormErrors } from "../../../lib/validate"
import { FormActions, FormCard } from "../FormCard"
import { TradeKindToggle } from "../TradeKindToggle"

type Direction = "buy" | "swap" | "sell"
const DIRECTIONS = ["buy", "swap", "sell"] as const

const EMPTY = { symbol: "", coinName: "", baseCurAmount: "", coinAmount: "", toSymbol: "", toAmount: "", tradeDate: "", notes: "" }

const upper = (s: string) => s.toUpperCase().trim()

/**
 * Records a buy, sell or swap. Everything is stored as "from X to Y":
 *   buy  = base currency → coin,   sell = coin → base currency,   swap = coin → coin.
 */
export function CryptoTradeForm({ portfolio, onDone }: { portfolio: PortfolioDetail; onDone: () => void }) {
  const invalidate = useInvalidate()
  const cur = portfolio.currency
  const [direction, setDirection] = useState<Direction>("buy")
  const [form, setForm] = useState(EMPTY)
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const { errors, check } = useFormErrors()
  const sellable = portfolio.positions.filter((p) => p.balance > 1e-10)
  const notes = form.notes.trim() || undefined

  function buildBody(): CreateCryptoTradeBody {
    if (direction === "buy") {
      return { tradeDate: form.tradeDate, fromSymbol: cur, fromAmount: form.baseCurAmount, toSymbol: upper(form.symbol), toAmount: form.coinAmount, assetName: form.coinName.trim() || undefined, notes }
    }
    if (direction === "sell") {
      return { tradeDate: form.tradeDate, fromSymbol: upper(form.symbol), fromAmount: form.coinAmount, toSymbol: cur, toAmount: form.baseCurAmount, notes }
    }
    return { tradeDate: form.tradeDate, fromSymbol: upper(form.symbol), fromAmount: form.coinAmount, toSymbol: upper(form.toSymbol), toAmount: form.toAmount, notes }
  }

  const save = useMutation({
    mutationFn: () => cryptoApi.addTrade(portfolio.id, buildBody()),
    onSuccess: () => {
      invalidate.portfolios("crypto")
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (check(createCryptoTradeSchema, buildBody())) save.mutate()
  }

  // The API describes every trade as "from X to Y"; map its field errors back onto the form's fields.
  const buy = direction === "buy"
  const err = {
    symbol: buy ? errors.toSymbol : errors.fromSymbol,
    coinAmount: buy ? errors.toAmount : errors.fromAmount,
    baseAmount: buy ? errors.fromAmount : errors.toAmount,
  }

  return (
    <FormCard onSubmit={submit}>
      <TradeKindToggle options={DIRECTIONS} value={direction} onChange={(d) => { setDirection(d); setForm(EMPTY) }} />

      {direction === "swap" && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded px-3 py-2">
          Cost basis transfers automatically — no P&L is realized at swap time.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={direction === "buy" ? "Symbol" : "From symbol"} error={err.symbol}>
          {direction !== "buy" && sellable.length > 0 ? (
            <Select required value={form.symbol} onChange={set("symbol")} className="w-full">
              <option value="">Select…</option>
              {sellable.map((p) => (
                <option key={p.symbol} value={p.symbol}>
                  {p.symbol} ({fmtSignificant(p.balance, 6)})
                </option>
              ))}
            </Select>
          ) : (
            <Input required placeholder="BTC" value={form.symbol} onChange={set("symbol")} className="w-full" />
          )}
        </Field>

        {direction === "buy" && (
          <Field label="Coin name">
            <Input placeholder="Bitcoin" value={form.coinName} onChange={set("coinName")} className="w-full" />
          </Field>
        )}

        <Field label={direction === "buy" ? "Amount received" : "Amount sold"} error={err.coinAmount}>
          <Input required type="number" step="any" min="0" placeholder="0.5" value={form.coinAmount} onChange={set("coinAmount")} className="w-full" />
        </Field>

        {direction === "swap" && (
          <>
            <Field label="To symbol" error={errors.toSymbol}>
              <Input required placeholder="ETH" value={form.toSymbol} onChange={set("toSymbol")} className="w-full" />
            </Field>
            <Field label="Amount received" error={errors.toAmount}>
              <Input required type="number" step="any" min="0" placeholder="3.0" value={form.toAmount} onChange={set("toAmount")} className="w-full" />
            </Field>
          </>
        )}

        {direction !== "swap" && (
          <Field label={`${cur} ${direction === "buy" ? "paid" : "received"}`} error={err.baseAmount}>
            <Input required type="number" step="any" min="0" placeholder="20000" value={form.baseCurAmount} onChange={set("baseCurAmount")} className="w-full" />
          </Field>
        )}

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
