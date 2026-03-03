import { useState, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getMe,
  getAccounts,
  updateAccount,
  getCategories,
  createCategory,
  deleteCategory,
  importCamt053,
  importCamt053Zip,
} from "../api"
import type { Account, ImportResult } from "@argent/shared"

// ─── Accounts Tab ─────────────────────────────────────────────────────────────

const EMPTY_EDIT = { name: "", type: "checking" as "checking" | "savings", openingBalance: "", openingBalanceDate: "" }

function fmtBalance(balance: string, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(parseFloat(balance))
}

function AccountsTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_EDIT)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(token),
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

  if (isLoading) return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>

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
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [color, setColor] = useState("#6366f1")

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(token),
  })

  const create = useMutation({
    mutationFn: () => createCategory(token, { name, color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] })
      setName("")
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })

  return (
    <div className="max-w-xl">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add category</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-9 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-white dark:bg-gray-800"
            title="Pick color"
          />
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {categories?.length === 0 && (
            <p className="px-4 py-6 text-gray-400 dark:text-gray-500 text-sm text-center">No categories yet.</p>
          )}
          {categories?.map((cat) => (
            <div key={cat.id} className="flex items-center px-4 py-3">
              <span
                className="w-3 h-3 rounded-full mr-3 flex-shrink-0"
                style={{ backgroundColor: cat.color ?? "#9ca3af" }}
              />
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{cat.name}</span>
              <button
                onClick={() => remove.mutate(cat.id)}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Import Tab ───────────────────────────────────────────────────────────────

type FileResult =
  | { filename: string; status: "pending" }
  | { filename: string; status: "importing" }
  | { filename: string; status: "done"; result: ImportResult }
  | { filename: string; status: "error"; error: string }

function ImportTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<FileResult[]>([])

  function updateItem(filename: string, update: Partial<FileResult>) {
    setItems((prev) =>
      prev.map((item) => (item.filename === filename ? { ...item, ...update } : item))
    )
  }

  function invalidateAfterImport() {
    qc.invalidateQueries({ queryKey: ["accounts"] })
    qc.invalidateQueries({ queryKey: ["transactions"] })
    qc.invalidateQueries({ queryKey: ["subscriptions"] })
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const fileArray = Array.from(files)
    setItems(fileArray.map((f) => ({ filename: f.name, status: "pending" })))
    for (const file of fileArray) {
      updateItem(file.name, { status: "importing" })
      try {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const { results, errors } = await importCamt053Zip(token, file)
          setItems((prev) => {
            const without = prev.filter((i) => i.filename !== file.name)
            const expanded: FileResult[] = [
              ...results.map((r) => ({
                filename: r.filename,
                status: "done" as const,
                result: { accountIban: r.accountIban, imported: r.imported, skipped: r.skipped },
              })),
              ...errors.map((e) => ({
                filename: e.filename,
                status: "error" as const,
                error: e.error,
              })),
            ]
            return [...without, ...expanded]
          })
          if (results.length > 0) invalidateAfterImport()
        } else {
          const result = await importCamt053(token, file)
          updateItem(file.name, { status: "done", result })
          if (result.imported > 0) invalidateAfterImport()
        }
      } catch (err) {
        updateItem(file.name, { status: "error", error: (err as Error).message })
      }
    }
  }

  const isDone = items.length > 0 && items.every((i) => i.status === "done" || i.status === "error")
  const totalImported = items.reduce((sum, i) => sum + (i.status === "done" ? i.result.imported : 0), 0)
  const totalSkipped = items.reduce((sum, i) => sum + (i.status === "done" ? i.result.skipped : 0), 0)

  return (
    <div className="max-w-2xl">
      <div
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
      >
        <p className="text-gray-500 dark:text-gray-400 mb-2">Drag & drop CAMT.053 XML or ZIP files here</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">or click to select files</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,.zip"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Imported</th>
                  <th className="px-4 py-3 text-right">Skipped</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
                  <tr key={item.filename}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {item.filename}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {item.status === "done" ? item.result.accountIban : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-medium">
                      {item.status === "done" ? item.result.imported : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 dark:text-gray-500">
                      {item.status === "done" ? item.result.skipped : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "pending" && <span className="text-gray-400 dark:text-gray-500 text-xs">Waiting…</span>}
                      {item.status === "importing" && <span className="text-indigo-600 dark:text-indigo-400 text-xs">Importing…</span>}
                      {item.status === "done" && <span className="text-green-600 dark:text-green-400 text-xs">Done</span>}
                      {item.status === "error" && (
                        <span className="text-red-600 dark:text-red-400 text-xs" title={(item as { error: string }).error}>Error</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {isDone && items.length > 1 && (
                <tfoot>
                  <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <td className="px-4 py-2" colSpan={2}>Total</td>
                    <td className="px-4 py-2 text-right text-green-700 dark:text-green-400">{totalImported}</td>
                    <td className="px-4 py-2 text-right text-gray-400 dark:text-gray-500">{totalSkipped}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {items.some((i) => i.status === "error") && (
            <div className="mt-3 space-y-1">
              {items.filter((i) => i.status === "error").map((i) => (
                <p key={i.filename} className="text-xs text-red-600 dark:text-red-400">
                  <span className="font-mono">{i.filename}</span>: {(i as { error: string }).error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => getMe(token),
    enabled: !!token,
  })

  const tabs = [
    { id: "accounts", label: "Accounts" },
    { id: "categories", label: "Categories" },
    ...(me?.canImport ? [{ id: "import", label: "Import" }] : []),
  ]

  const activeTab = searchParams.get("tab") ?? "accounts"

  function setTab(id: string) {
    setSearchParams({ tab: id }, { replace: true })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "accounts" && <AccountsTab token={token} />}
      {activeTab === "categories" && <CategoriesTab token={token} />}
      {activeTab === "import" && me?.canImport && <ImportTab token={token} />}
    </div>
  )
}
