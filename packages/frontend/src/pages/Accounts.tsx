import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccounts, updateAccount } from "../api"
import type { Account } from "@argent/shared"

const EMPTY_EDIT = { name: "", type: "checking" as "checking" | "savings", openingBalance: "", openingBalanceDate: "" }

function fmtBalance(balance: string, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(parseFloat(balance))
}

export default function AccountsPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_EDIT)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(token),
    enabled: !!token,
  })

  const save = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      updateAccount(token, id, {
        name: form.name || undefined,
        type: form.type,
        openingBalance: form.openingBalance || undefined,
        openingBalanceDate: form.openingBalanceDate || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      setEditing(null)
    },
  })

  function startEdit(acc: Account) {
    setEditing(acc.id)
    const bal = parseFloat(acc.openingBalance ?? "0")
    setForm({
      name: acc.name ?? "",
      type: acc.type ?? "checking",
      openingBalance: bal !== 0 ? String(bal) : "",
      openingBalanceDate: acc.openingBalanceDate ?? "",
    })
  }

  if (isLoading) {
    return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Accounts</h1>
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {accounts.map((acc) => (
          <div key={acc.id} className="px-5 py-4">
            {/* Account row */}
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mb-0.5">{acc.iban}</div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {acc.name ?? <span className="text-gray-400 dark:text-gray-500 italic">No name set</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                  acc.type === "savings"
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                }`}>
                  {acc.type === "savings" ? "Savings" : "Checking"}
                </span>
                <span className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                  {fmtBalance(acc.balance ?? "0", acc.currency)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase">{acc.currency}</span>
                {editing !== acc.id && (
                  <button
                    onClick={() => startEdit(acc)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Inline edit form */}
            {editing === acc.id && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Name</label>
                    <input
                      autoFocus
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-52"
                      placeholder="Account name…"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Type</label>
                    <div className="flex rounded overflow-hidden border border-gray-300 dark:border-gray-600 text-sm">
                      {(["checking", "savings"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, type: t }))}
                          className={`px-3 py-1 font-medium capitalize transition-colors ${
                            form.type === t
                              ? "bg-indigo-600 text-white"
                              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                      Opening balance ({acc.currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={form.openingBalance}
                      onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-32"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">As of date</label>
                    <input
                      type="date"
                      value={form.openingBalanceDate}
                      onChange={(e) => setForm((f) => ({ ...f, openingBalanceDate: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <button
                    onClick={() => save.mutate({ id: acc.id })}
                    disabled={save.isPending}
                    className="text-sm px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-sm px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
                {acc.openingBalanceDate && (
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    Balance calculated from {acc.openingBalanceDate}
                    {parseFloat(acc.openingBalance ?? "0") !== 0 &&
                      ` (opening: ${fmtBalance(acc.openingBalance, acc.currency)})`}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
            No accounts yet — import a CAMT.053 file to get started.
          </div>
        )}
      </div>
    </div>
  )
}
