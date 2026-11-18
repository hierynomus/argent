import { useState } from "react"
import { useAdminAccounts, useAdminSharing, useInvalidate, useMe } from "../api"
import { EmptyState, LoadingText, cx } from "../components/ui"
import { SharingOverview } from "../features/admin/SharingOverview"
import { BackupRestoreSection } from "../features/admin/BackupRestoreSection"
import { AccountMemberCard } from "../features/admin/AccountMemberCard"

type Tab = "accounts" | "sharing" | "backup"

export default function AdminPage() {
  const invalidate = useInvalidate()
  const [tab, setTab] = useState<Tab>("accounts")

  const { data: me, isLoading: meLoading } = useMe()
  const isAdmin = me?.isAdmin === true
  // the admin endpoints are admin-only: don't even ask unless we know the user is one
  const { data: accounts = [], isLoading: accountsLoading } = useAdminAccounts({ enabled: isAdmin })
  const { data: sharing, isLoading: sharingLoading } = useAdminSharing({ enabled: isAdmin && tab === "sharing" })

  if (meLoading) return <LoadingText />

  if (!me?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-2xl font-semibold text-gray-400 dark:text-gray-500">403 — Forbidden</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">You do not have admin access.</p>
      </div>
    )
  }

  const tabCls = (t: Tab) =>
    cx(
      "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
      tab === t
        ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
    )

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Administration</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button type="button" aria-pressed={tab === "accounts"} className={tabCls("accounts")} onClick={() => setTab("accounts")}>
          Accounts & Permissions
        </button>
        <button type="button" aria-pressed={tab === "sharing"} className={tabCls("sharing")} onClick={() => setTab("sharing")}>
          Sharing Overview
        </button>
        <button type="button" aria-pressed={tab === "backup"} className={tabCls("backup")} onClick={() => setTab("backup")}>
          Backup & Restore
        </button>
      </div>

      {tab === "accounts" && (
        accountsLoading ? (
          <LoadingText />
        ) : accounts.length === 0 ? (
          <EmptyState title="No accounts yet." />
        ) : (
          <div className="flex flex-col gap-4">
            {accounts.map((account) => (
              <AccountMemberCard key={account.id} account={account} onChanged={invalidate.admin} />
            ))}
          </div>
        )
      )}

      {tab === "sharing" && (
        sharingLoading ? (
          <LoadingText />
        ) : (
          <SharingOverview sharing={sharing ?? { portfolios: [], mortgages: [], loans: [] }} />
        )
      )}

      {tab === "backup" && <BackupRestoreSection />}
    </div>
  )
}
