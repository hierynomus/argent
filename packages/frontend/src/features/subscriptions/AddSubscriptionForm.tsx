import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { createSubscriptionSchema, type Account } from "@argent/shared"
import { createSubscription, useInvalidate } from "../../api"
import { Button, ErrorText, Field, Input, Select } from "../../components/ui"
import { useFormErrors } from "../../lib/validate"

/** Manually track a subscription: pick the account and the counterparty's IBAN; existing payments are linked automatically. */
export function AddSubscriptionForm({ accounts, onDone }: { accounts: Account[]; onDone: () => void }) {
  const invalidate = useInvalidate()
  const { errors, check } = useFormErrors()
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "")
  const [counterpartyIban, setCounterpartyIban] = useState("")
  const [name, setName] = useState("")

  const body = () => ({ accountId, counterpartyIban: counterpartyIban.trim(), name: name.trim() || undefined })

  const create = useMutation({
    mutationFn: () => createSubscription(body()),
    onSuccess: () => {
      invalidate.subscriptions()
      onDone()
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (check(createSubscriptionSchema, body())) create.mutate()
  }

  return (
    <form onSubmit={submit} className="border border-indigo-200 dark:border-indigo-800 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-5 py-4">
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Account" error={errors.accountId}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.iban}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Counterparty IBAN" error={errors.counterpartyIban}>
          <Input autoFocus type="text" value={counterpartyIban} onChange={(e) => setCounterpartyIban(e.target.value)} placeholder="NL00BANK0123456789" className="w-52 font-mono" required />
        </Field>
        <Field label="Label (optional)">
          <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" className="w-40" />
        </Field>
        <Button type="submit" className="rounded-md" disabled={create.isPending || !counterpartyIban.trim()}>
          {create.isPending ? "Adding…" : "Add"}
        </Button>
        <Button variant="muted-link" size="sm" className="!px-2" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText error={create.error} />
    </form>
  )
}
