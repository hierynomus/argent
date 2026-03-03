import { useState, useRef } from "react"
import { useAuth } from "react-oidc-context"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getMe, getAdminAccounts, getAdminSharing, addMember, removeMember, updateAccountOwner, downloadBackup, restoreBackup } from "../api"
import type { AccountWithMembers, AdminSharingResponse } from "@argent/shared"

type Tab = "accounts" | "sharing" | "backup"

export default function AdminPage() {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>("accounts")

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => getMe(token),
  })

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: () => getAdminAccounts(token),
    enabled: me?.isAdmin === true,
  })

  const { data: sharing, isLoading: sharingLoading } = useQuery<AdminSharingResponse>({
    queryKey: ["admin", "sharing"],
    queryFn: () => getAdminSharing(token),
    enabled: me?.isAdmin === true && tab === "sharing",
  })

  if (meLoading) {
    return <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
  }

  if (!me?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-2xl font-semibold text-gray-400 dark:text-gray-500">403 — Forbidden</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">You do not have admin access.</p>
      </div>
    )
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
    }`

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Administration</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button className={tabCls("accounts")} onClick={() => setTab("accounts")}>
          Accounts & Permissions
        </button>
        <button className={tabCls("sharing")} onClick={() => setTab("sharing")}>
          Sharing Overview
        </button>
        <button className={tabCls("backup")} onClick={() => setTab("backup")}>
          Backup & Restore
        </button>
      </div>

      {tab === "accounts" && (
        accountsLoading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
        ) : accounts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
            No accounts yet.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {accounts.map((account) => (
              <AccountMemberCard
                key={account.id}
                account={account}
                token={token}
                onChanged={() => qc.invalidateQueries({ queryKey: ["admin", "accounts"] })}
              />
            ))}
          </div>
        )
      )}

      {tab === "sharing" && (
        sharingLoading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm">Loading…</p>
        ) : (
          <SharingOverview sharing={sharing ?? { portfolios: [], mortgages: [], loans: [] }} />
        )
      )}

      {tab === "backup" && <BackupRestoreSection token={token} />}
    </div>
  )
}

function SharingOverview({ sharing }: { sharing: AdminSharingResponse }) {
  const hasAny = sharing.portfolios.length > 0 || sharing.mortgages.length > 0 || sharing.loans.length > 0
  if (!hasAny) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
        No resources are shared with groups yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sharing.portfolios.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Portfolios</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-2 text-left">Name</th>
                <th className="px-5 py-2 text-left">Type</th>
                <th className="px-5 py-2 text-left">Group</th>
                <th className="px-5 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sharing.portfolios.flatMap((p) =>
                p.members.map((m, i) => (
                  <tr key={`${p.id}-${m.groupName}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{i === 0 ? p.name : ""}</td>
                    <td className="px-5 py-2 text-gray-500 dark:text-gray-400 capitalize">{i === 0 ? p.type : ""}</td>
                    <td className="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{m.groupName}</td>
                    <td className="px-5 py-2"><RoleBadge role={m.role as "viewer" | "editor"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {sharing.mortgages.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Mortgages</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-2 text-left">Name</th>
                <th className="px-5 py-2 text-left">Group</th>
                <th className="px-5 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sharing.mortgages.flatMap((m) =>
                m.members.map((mem, i) => (
                  <tr key={`${m.id}-${mem.groupName}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{i === 0 ? m.name : ""}</td>
                    <td className="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{mem.groupName}</td>
                    <td className="px-5 py-2"><RoleBadge role={mem.role as "viewer" | "editor"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {sharing.loans.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Loans</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <th className="px-5 py-2 text-left">Name</th>
                <th className="px-5 py-2 text-left">Group</th>
                <th className="px-5 py-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {sharing.loans.flatMap((l) =>
                l.members.map((mem, i) => (
                  <tr key={`${l.id}-${mem.groupName}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{i === 0 ? l.name : ""}</td>
                    <td className="px-5 py-2 font-mono text-gray-700 dark:text-gray-300">{mem.groupName}</td>
                    <td className="px-5 py-2"><RoleBadge role={mem.role as "viewer" | "editor"} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BackupRestoreSection({ token }: { token: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<Record<string, number> | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadBackup(token)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setRestoreFile(file)
    setRestoreResult(null)
    setRestoreError(null)
    setConfirmOpen(false)
  }

  async function handleRestore() {
    if (!restoreFile) return
    setRestoring(true)
    setRestoreError(null)
    setRestoreResult(null)
    setConfirmOpen(false)
    try {
      const text = await restoreFile.text()
      const data = JSON.parse(text)
      const result = await restoreBackup(token, data)
      setRestoreResult(result.restored)
      setRestoreFile(null)
      if (fileRef.current) fileRef.current.value = ""
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : "Restore failed")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">

      {/* Backup */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Download backup</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Export all accounts, transactions, categories, portfolios and more as a single JSON file.
            </p>
            {downloadError && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">{downloadError}</p>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="shrink-0 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {downloading ? "Exporting…" : "Download"}
          </button>
        </div>
      </div>

      {/* Restore */}
      <div className="px-5 py-4">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Restore from backup</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
          Select a previously downloaded backup file.{" "}
          <span className="text-red-500 dark:text-red-400 font-medium">
            This will permanently replace all existing data.
          </span>
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200 hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
            onChange={handleFileChange}
          />
          {restoreFile && !confirmOpen && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Restore
            </button>
          )}
        </div>

        {confirmOpen && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-2">
              Are you sure? All current data will be deleted and replaced with the contents of{" "}
              <span className="font-mono">{restoreFile?.name}</span>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {restoring ? "Restoring…" : "Yes, replace all data"}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {restoreError && (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400">{restoreError}</p>
        )}

        {restoreResult && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">Restore complete</p>
            <ul className="text-xs text-green-600 dark:text-green-400 space-y-0.5">
              {Object.entries(restoreResult).map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: "viewer" | "editor" }) {
  return (
    <span
      className={`text-xs font-medium px-1.5 py-0.5 rounded ${
        role === "editor"
          ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
      }`}
    >
      {role}
    </span>
  )
}

function AccountMemberCard({
  account,
  token,
  onChanged,
}: {
  account: AccountWithMembers
  token: string
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingOwner, setEditingOwner] = useState(false)
  const [ownerSub, setOwnerSub] = useState(account.ownerSub ?? "")
  const [ownerSaving, setOwnerSaving] = useState(false)
  const [ownerError, setOwnerError] = useState<string | null>(null)

  async function handleSaveOwner() {
    setOwnerSaving(true)
    setOwnerError(null)
    try {
      await updateAccountOwner(token, account.id, ownerSub.trim() || null)
      setEditingOwner(false)
      onChanged()
    } catch (e) {
      setOwnerError(e instanceof Error ? e.message : "Failed to update owner")
    } finally {
      setOwnerSaving(false)
    }
  }

  async function handleAdd() {
    const trimmed = groupName.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      await addMember(token, account.id, trimmed, role)
      setAdding(false)
      setGroupName("")
      setRole("viewer")
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add group")
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(name: string) {
    await removeMember(token, account.id, name)
    onChanged()
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Account header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {account.name ?? <span className="text-gray-400 dark:text-gray-500 italic">Unnamed</span>}
        </div>
        <div className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-0.5">{account.iban}</div>
        <div className="mt-2">
          {editingOwner ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="User sub (Authentik UUID)"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={ownerSub}
                  onChange={(e) => setOwnerSub(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveOwner()}
                  autoFocus
                />
                <button
                  onClick={handleSaveOwner}
                  disabled={ownerSaving}
                  className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {ownerSaving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => { setEditingOwner(false); setOwnerSub(account.ownerSub ?? ""); setOwnerError(null) }}
                  className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
              {ownerError && <p className="text-xs text-red-500 dark:text-red-400">{ownerError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Owner:</span>
              {account.ownerProfile ? (
                <span className="text-xs text-gray-700 dark:text-gray-300">{account.ownerProfile.email}</span>
              ) : account.ownerSub ? (
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{account.ownerSub}</span>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">No owner</span>
              )}
              <button
                onClick={() => { setEditingOwner(true); setOwnerSub(account.ownerSub ?? "") }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Group access list */}
      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {account.members.length === 0 ? (
          <div className="px-5 py-3 text-sm text-gray-400 dark:text-gray-500 italic">No groups assigned</div>
        ) : (
          account.members.map((member) => (
            <div key={member.groupName} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{member.groupName}</span>
                <RoleBadge role={member.role} />
              </div>
              <button
                onClick={() => handleRemove(member.groupName)}
                className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium shrink-0"
              >
                Remove
              </button>
            </div>
          ))
        )}

        {/* Add group row */}
        <div className="px-5 py-3">
          {adding ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Authentik group name"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  autoFocus
                />
                <select
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!groupName.trim() || saving}
                  className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Adding…" : "Add"}
                </button>
                <button
                  onClick={() => { setAdding(false); setGroupName(""); setError(null) }}
                  className="text-sm px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
            >
              + Add group
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
