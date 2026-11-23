import type { LocalSettings, LockStatus, SavedBackup } from "@argent/shared"
import { http } from "./client"

/** Only the standalone (desktop) app has these endpoints. */
export const getLocalSettings = () => http.get<LocalSettings>("/local/settings")
export const setBackupDir = (backupDir: string) => http.put<LocalSettings>("/local/settings", { backupDir })
/** Writes a backup file into the chosen folder and says where it went. */
export const saveBackupToFolder = () => http.post<SavedBackup>("/local/backup", {})

/** The password of the standalone app: is there one, and is this window unlocked? */
export const getLockStatus = () => http.get<LockStatus>("/local/auth/status")
export const unlockApp = (password: string) => http.post<LockStatus>("/local/auth/unlock", { password })
export const lockApp = () => http.post<LockStatus>("/local/auth/lock", {})
/** Sets the password, or changes it (`currentPassword` is then required). */
export const setAppPassword = (password: string, currentPassword?: string) => http.put<LockStatus>("/local/auth/password", { password, currentPassword })
export const removeAppPassword = (currentPassword: string) => http.post<LockStatus>("/local/auth/password/remove", { currentPassword })
