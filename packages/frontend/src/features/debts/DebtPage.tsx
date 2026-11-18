import { useState } from "react"
import { createDebtSchema } from "@argent/shared"
import { useMutation } from "@tanstack/react-query"
import { debtApis, useDebts, useInvalidate, type DebtKind } from "../../api"
import { Button, EmptyState, ErrorText, Field, FieldGroup, Input, LoadingText, SegmentedControl } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"
import { DEBT_KINDS } from "./config"
import { DebtCard } from "./DebtCard"

type Currency = "EUR" | "USD"

/** The Mortgages and Loans screens: a list of debts with a "new" form. Wording comes from `DEBT_KINDS`. */
export function DebtPage({ kind }: { kind: DebtKind }) {
  const cfg = DEBT_KINDS[kind]
  const invalidate = useInvalidate()
  const { data: debts = [], isLoading } = useDebts(kind)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<{ name: string; currency: Currency }>({ name: "", currency: "EUR" })

  const { errors, check } = useFormErrors()

  const create = useMutation({
    mutationFn: () => debtApis[kind].create({ name: form.name, currency: form.currency }),
    onSuccess: () => {
      invalidate.debts(kind)
      setForm({ name: "", currency: "EUR" })
      setShowCreate(false)
    },
  })

  if (isLoading) return <LoadingText />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{cfg.title}</h1>
        {!showCreate && (
          <Button size="md" className="rounded-lg" onClick={() => setShowCreate(true)}>
            + New {cfg.noun}
          </Button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-6 py-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">New {cfg.noun}</p>
          <div className="flex gap-3 flex-wrap items-end">
            <Field label="Name" error={errors.name}>
              <Input density="lg" type="text" placeholder={cfg.createPlaceholder} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-56" />
            </Field>
            <FieldGroup label="Currency">
              <SegmentedControl options={["EUR", "USD"] as const} value={form.currency} onChange={(currency) => setForm((f) => ({ ...f, currency }))} padding="px-3 py-1.5" />
            </FieldGroup>
            <Button disabled={!form.name || create.isPending} onClick={() => check(createDebtSchema, { name: form.name, currency: form.currency }) && create.mutate()}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
          <ErrorText error={create.error} />
        </div>
      )}

      {debts.length === 0 && !showCreate ? (
        <EmptyState title={`No ${cfg.noun}s yet.`} hint={cfg.emptyHint} />
      ) : (
        <div className="space-y-6">
          {debts.map((debt) => (
            <DebtCard key={debt.id} kind={kind} debt={debt} />
          ))}
        </div>
      )}
    </div>
  )
}
