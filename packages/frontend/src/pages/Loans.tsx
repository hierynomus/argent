import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getLoans,
  createLoan,
  deleteLoan,
  addLoanPart,
  updateLoanPart,
  deleteLoanPart,
  addLoanExtraPayment,
  deleteLoanExtraPayment,
  addLoanMember,
  removeLoanMember,
} from "../api"
import type { LoanMember, LoanWithParts, LoanPart } from "@argent/shared"

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmtCur(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n)
}

function fmtRate(rate: string) {
  return `${(parseFloat(rate) * 100).toFixed(2)}%`
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short" })
}

function typeBadge(type: LoanPart["type"]) {
  const styles: Record<LoanPart["type"], string> = {
    linear: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
    annuity: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
    interest_only: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  }
  const labels: Record<LoanPart["type"], string> = {
    linear: "Linear",
    annuity: "Annuity",
    interest_only: "Interest-only",
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  )
}

// ─── Extra payment section per part ─────────────────────────────────────────

function ExtraPaymentsPanel({
  loan,
  part,
  token,
  canEdit,
}: {
  loan: LoanWithParts
  part: LoanPart
  token: string
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ paymentDate: "", amount: "", notes: "" })

  const addPayment = useMutation({
    mutationFn: () =>
      addLoanExtraPayment(token, loan.id, part.id, {
        paymentDate: form.paymentDate,
        amount: form.amount,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] })
      setForm({ paymentDate: "", amount: "", notes: "" })
    },
  })

  const deletePayment = useMutation({
    mutationFn: (paymentId: string) => deleteLoanExtraPayment(token, loan.id, part.id, paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  })

  return (
    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
        Extra payments
      </p>
      {part.extraPayments.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">No extra payments recorded.</p>
      ) : (
        <table className="w-full text-sm mb-3">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {part.extraPayments.map((ep) => (
              <tr key={ep.id}>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 w-28 whitespace-nowrap">
                  {ep.paymentDate}
                </td>
                <td className="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-200 tabular-nums">
                  {fmtCur(parseFloat(ep.amount), loan.currency)}
                </td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 text-xs">
                  {ep.notes ?? ""}
                </td>
                {canEdit && (
                  <td className="py-1.5 text-right">
                    <button
                      onClick={() => deletePayment.mutate(ep.id)}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Amount ({loan.currency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-32"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notes (optional)</label>
            <input
              type="text"
              placeholder="optional"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-44"
            />
          </div>
          <button
            onClick={() => addPayment.mutate()}
            disabled={!form.paymentDate || !form.amount || addPayment.isPending}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Loan part row ───────────────────────────────────────────────────────────

function PartRow({
  loan,
  part,
  token,
  canEdit,
}: {
  loan: LoanWithParts
  part: LoanPart
  token: string
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const [showPayments, setShowPayments] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: part.name,
    annualInterestRate: (parseFloat(part.annualInterestRate) * 100).toFixed(4),
    endDate: part.endDate,
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updatePart = useMutation({
    mutationFn: () =>
      updateLoanPart(token, loan.id, part.id, {
        name: editForm.name,
        annualInterestRate: (parseFloat(editForm.annualInterestRate) / 100).toFixed(6),
        endDate: editForm.endDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] })
      setEditing(false)
    },
  })

  const removePart = useMutation({
    mutationFn: () => deleteLoanPart(token, loan.id, part.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  })

  const progressPct = Math.round((part.monthsElapsed / part.totalMonths) * 100)

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{part.name}</td>
        <td className="px-4 py-3">{typeBadge(part.type)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">
          {fmtCur(parseFloat(part.principal), loan.currency)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
          {fmtCur(part.currentBalance, loan.currency)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-600 dark:text-gray-400">
          {fmtRate(part.annualInterestRate)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums text-gray-900 dark:text-gray-100">
          <span className="font-medium">{fmtCur(part.monthlyPayment, loan.currency)}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">/mo</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          <span className="text-gray-400 dark:text-gray-500">{fmtDate(part.startDate)}</span>
          {" → "}
          {fmtDate(part.endDate)}
        </td>
        <td className="px-4 py-3 w-32">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
              {part.monthsRemaining}mo
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowPayments((v) => !v)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {showPayments ? "Hide" : "Payments"}
            </button>
            {canEdit && (
              <>
                <button
                  onClick={() => { setEditing((v) => !v); setConfirmDelete(false) }}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Edit
                </button>
                {confirmDelete ? (
                  <>
                    <button onClick={() => removePart.mutate()} className="text-xs text-red-600 font-medium">Sure?</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">No</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setConfirmDelete(true); setEditing(false) }}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>

      {editing && canEdit && (
        <tr className="bg-indigo-50 dark:bg-indigo-950/30">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={editForm.annualInterestRate}
                  onChange={(e) => setEditForm((f) => ({ ...f, annualInterestRate: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-24"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">End date</label>
                <input
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36"
                />
              </div>
              <button
                onClick={() => updatePart.mutate()}
                disabled={updatePart.isPending}
                className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}

      {showPayments && (
        <tr>
          <td colSpan={9} className="p-0">
            <ExtraPaymentsPanel loan={loan} part={part} token={token} canEdit={canEdit} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Add part form ───────────────────────────────────────────────────────────

function AddPartForm({ loan, token, onDone }: { loan: LoanWithParts; token: string; onDone: () => void }) {
  const qc = useQueryClient()
  const TYPES = [
    { value: "linear", label: "Linear" },
    { value: "annuity", label: "Annuity" },
    { value: "interest_only", label: "Interest-only" },
  ] as const
  const [form, setForm] = useState({
    name: "",
    type: "annuity" as "linear" | "annuity" | "interest_only",
    principal: "",
    annualInterestRate: "",
    startDate: "",
    endDate: "",
  })

  const addPart = useMutation({
    mutationFn: () =>
      addLoanPart(token, loan.id, {
        name: form.name,
        type: form.type,
        principal: form.principal,
        annualInterestRate: (parseFloat(form.annualInterestRate) / 100).toFixed(6),
        startDate: form.startDate,
        endDate: form.endDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] })
      onDone()
    },
  })

  const canSubmit = form.name && form.principal && form.annualInterestRate && form.startDate && form.endDate

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 px-6 py-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add part</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
          <input
            type="text"
            placeholder="Main"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Type</label>
          <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                className={`px-2 py-1.5 ${
                  form.type === t.value
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Principal ({loan.currency})</label>
          <input
            type="number"
            min="0"
            step="100"
            placeholder="10000"
            value={form.principal}
            onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-32"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rate (%/yr)</label>
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="5.000"
            value={form.annualInterestRate}
            onChange={(e) => setForm((f) => ({ ...f, annualInterestRate: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-24"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">End date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36"
          />
        </div>
        <button
          onClick={() => addPart.mutate()}
          disabled={!canSubmit || addPart.isPending}
          className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {addPart.isPending ? "Adding…" : "Add part"}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
      {addPart.isError && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">{(addPart.error as Error).message}</p>
      )}
    </div>
  )
}

// ─── Access section (owner-only) ─────────────────────────────────────────────

function AccessSection({ loan, token }: { loan: LoanWithParts; token: string }) {
  const qc = useQueryClient()
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")

  const addMember = useMutation({
    mutationFn: () => addLoanMember(token, loan.id, { groupName: groupName.trim(), role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] })
      setGroupName("")
    },
  })

  const removeMember = useMutation({
    mutationFn: (gn: string) => removeLoanMember(token, loan.id, gn),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  })

  return (
    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Shared access
      </p>

      {loan.members.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Not shared with anyone.</p>
      ) : (
        <div className="flex flex-col gap-1.5 mb-3">
          {loan.members.map((m: LoanMember) => (
            <div key={m.groupName} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{m.groupName}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                m.role === "editor"
                  ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}>
                {m.role}
              </span>
              <button
                onClick={() => removeMember.mutate(m.groupName)}
                disabled={removeMember.isPending}
                className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add member form */}
      <div className="flex gap-2 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Group name</label>
          <input
            type="text"
            placeholder="e.g. family"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-44"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
          <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
            {(["viewer", "editor"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`px-2.5 py-1 capitalize ${
                  role === r
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => addMember.mutate()}
          disabled={!groupName.trim() || addMember.isPending}
          className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          + Add
        </button>
      </div>
      {addMember.isError && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">{(addMember.error as Error).message}</p>
      )}
    </div>
  )
}

// ─── Loan card ───────────────────────────────────────────────────────────────

function LoanCard({ loan, token }: { loan: LoanWithParts; token: string }) {
  const qc = useQueryClient()
  const [showAddPart, setShowAddPart] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const removeLoan = useMutation({
    mutationFn: () => deleteLoan(token, loan.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loans"] }),
  })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{loan.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-400 dark:text-gray-500">{loan.currency}</p>
            {!loan.isOwner && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {loan.canEdit ? "editor" : "viewer"}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {fmtCur(loan.totalCurrentBalance, loan.currency)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {fmtCur(loan.totalMonthlyPayment, loan.currency)}<span className="text-xs">/mo</span>
          </p>
        </div>
      </div>

      {loan.parts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Original</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Balance</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Rate</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Monthly</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Term</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Progress</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {loan.parts.map((part) => (
                <PartRow key={part.id} loan={loan} part={part} token={token} canEdit={loan.canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Access section (owner-only, collapsible) */}
      {loan.isOwner && showAccess && (
        <AccessSection loan={loan} token={token} />
      )}

      {/* Card footer */}
      {showAddPart ? (
        <AddPartForm loan={loan} token={token} onDone={() => setShowAddPart(false)} />
      ) : (
        <div className="px-6 py-3 flex items-center justify-between border-t border-gray-100 dark:border-gray-800 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {loan.canEdit && (
              <button
                onClick={() => setShowAddPart(true)}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                + Add part
              </button>
            )}
            {loan.isOwner && (
              <button
                onClick={() => setShowAccess((v) => !v)}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {showAccess ? "Hide access" : "Share"}
              </button>
            )}
          </div>
          {loan.isOwner && (
            <div className="flex items-center gap-3">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Delete loan?</span>
                  <button onClick={() => removeLoan.mutate()} className="text-xs text-red-600 dark:text-red-400 font-medium">Yes</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">No</button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                >
                  Delete loan
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LoansPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans"],
    queryFn: () => getLoans(token),
    enabled: !!token,
  })

  const [showCreate, setShowCreate] = useState(false)
  const [newForm, setNewForm] = useState({ name: "", currency: "EUR" as "EUR" | "USD" })

  const createMut = useMutation({
    mutationFn: () => createLoan(token, { name: newForm.name, currency: newForm.currency }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] })
      setNewForm({ name: "", currency: "EUR" })
      setShowCreate(false)
    },
  })

  if (isLoading) {
    return <div className="text-gray-400 dark:text-gray-500 text-sm">Loading…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Loans</h1>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            + New loan
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-6 py-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">New loan</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
              <input
                type="text"
                placeholder="e.g. Car loan"
                value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-56"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Currency</label>
              <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
                {(["EUR", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewForm((f) => ({ ...f, currency: c }))}
                    className={`px-3 py-1.5 ${
                      newForm.currency === c
                        ? "bg-indigo-600 text-white"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => createMut.mutate()}
              disabled={!newForm.name || createMut.isPending}
              className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loans.length === 0 && !showCreate ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-6 py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">No loans yet.</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            Click "+ New loan" to add a personal loan, car loan, or any other debt.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {loans.map((loan) => (
            <LoanCard key={loan.id} loan={loan} token={token} />
          ))}
        </div>
      )}
    </div>
  )
}
