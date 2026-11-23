import type { LocalSettings, SavedBackup } from "@argent/shared"
import { http } from "./client"

/** Only the standalone (desktop) app has these endpoints. */
export const getLocalSettings = () => http.get<LocalSettings>("/local/settings")
export const setBackupDir = (backupDir: string) => http.put<LocalSettings>("/local/settings", { backupDir })
/** Writes a backup file into the chosen folder and says where it went. */
export const saveBackupToFolder = () => http.post<SavedBackup>("/local/backup", {})
