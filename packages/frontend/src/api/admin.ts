import type { Account, AccountWithMembers, AdminSharingResponse } from "@argent/shared"
import { download, http } from "./client"

export const getAdminAccounts = () => http.get<AccountWithMembers[]>("/admin/accounts")

export const getAdminSharing = () => http.get<AdminSharingResponse>("/admin/sharing")

export const addMember = (accountId: string, groupName: string, role: "viewer" | "editor" = "viewer") =>
  http.post<{ accountId: string; groupName: string; role: string }>(`/admin/accounts/${accountId}/members`, { groupName, role })

export const removeMember = (accountId: string, groupName: string) =>
  http.delete(`/admin/accounts/${accountId}/members/${encodeURIComponent(groupName)}`)

export const updateAccountOwner = (accountId: string, ownerSub: string | null) =>
  http.patch<Account>(`/admin/accounts/${accountId}`, { ownerSub })

/** Downloads the full backup as a JSON file through the browser. */
export async function downloadBackup(): Promise<void> {
  const { blob, filename } = await download("/admin/backup", "argent-backup.json")
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  // the browser reads the blob after the click: revoking at once can cancel the download in a webview
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const restoreBackup = (data: unknown) =>
  http.post<{ ok: boolean; restored: Record<string, number> }>("/admin/restore", data)
