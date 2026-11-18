import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { updateAccountSchema, type Account } from "@argent/shared"
import { updateAccount, useAccounts, useInvalidate } from "../../api"
import { Button, ErrorText, Field, FieldGroup, Input, LoadingText, SegmentedControl, cx } from "../../components/ui"
import { fmtBalance } from "../../lib/format"
import { useFormErrors } from "../../lib/validate"

type AccountType = "checking" | "savings"

const TYPE_BADGE: Record<AccountType, string> = {
  savings: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  checking: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
}

/** Edit form for one account: name, type, and the opening balance the computed balance starts from. */
function AccountEditForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const invalidate = useInvalidate()
  const { errors, check } = useFormErrors()
  const opening = parseFloat(account.openingBalance ?? "0")
  const [form, setForm] = useState({
    name: account.name ?? "",
    type: (account.type ?? "checking") as AccountType,
    openingBalance: opening !== 0 ? String(opening) : "",
    openingBalanceDate: account.openingBalanceDate ?? "",
  })

  const body = () => ({
    // a blank name clears it (the API treats "" as "no name")
    name: form.name,
    type: form.type,
    openingBalance: form.openingBalance || undefined,
    openingBalanceDate: form.openingBalanceDate || null,
  })

  const save = useMutation({
    mutationFn: () => updateAccount(account.id, body()),
    onSuccess: () => {
      invalidate.accounts()
      onDone()
    },
  })

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Name" error={errors.name}>
          <Input autoFocus density="sm" type="text" placeholder="Account name…" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-52" />
        </Field>
        <FieldGroup label="Type">
          <SegmentedControl options={["checking", "savings"] as const} value={form.type} onChange={(type) => setForm((f) => ({ ...f, type }))} padding="px-3 py-1 font-medium" capitalize />
        </FieldGroup>
        <Field label={`Opening balance (${account.currency})`} error={errors.openingBalance}>
          <Input density="sm" type="number" step="0.01" placeholder="0.00" value={form.openingBalance} onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))} className="w-32" />
        </Field>
        <Field label="As of date" error={errors.openingBalanceDate}>
          <Input density="sm" type="date" value={form.openingBalanceDate} onChange={(e) => setForm((f) => ({ ...f, openingBalanceDate: e.target.value }))} />
        </Field>
        <Button size="sm" className="!py-1" disabled={save.isPending} onClick={() => check(updateAccountSchema, body()) && save.mutate()}>
          Save
        </Button>
        <Button variant="muted-link" size="sm" className="!px-2 !py-1" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorText error={save.error} />
      {account.openingBalanceDate && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Balance calculated from {account.openingBalanceDate}
          {opening !== 0 && ` (opening: ${fmtBalance(account.openingBalance, account.currency, "nl-NL")})`}
        </p>
      )}
    </div>
  )
}

/** Settings → Accounts: every account with its balance, and inline editing. */
export function AccountsTab() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const { data: accounts = [], isLoading } = useAccounts()

  if (isLoading) return <LoadingText />

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
      {accounts.map((acc) => (
        <div key={acc.id} className="px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mb-0.5">{acc.iban}</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {acc.name ?? <span className="text-gray-400 dark:text-gray-500 italic">No name set</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={cx("text-xs px-2 py-0.5 rounded-full font-medium border", TYPE_BADGE[acc.type === "savings" ? "savings" : "checking"])}>
                {acc.type === "savings" ? "Savings" : "Checking"}
              </span>
              <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">{fmtBalance(acc.balance ?? "0", acc.currency, "nl-NL")}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{acc.currency}</span>
              {editingId !== acc.id && (
                <Button variant="link" size="xs" onClick={() => setEditingId(acc.id)}>
                  Edit
                </Button>
              )}
            </div>
          </div>

          {editingId === acc.id && <AccountEditForm account={acc} onDone={() => setEditingId(null)} />}
        </div>
      ))}
      {accounts.length === 0 && (
        <div className="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">No accounts yet — import a CAMT.053 file to get started.</div>
      )}
    </div>
  )
}
