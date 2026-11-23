import { accessSync, constants, existsSync, mkdirSync, writeFileSync } from "fs"
import { isAbsolute, join } from "path"
import type { LocalSettings, SavedBackup } from "@argent/shared"
import { expandHome, SETTINGS_FILE, updateSettingsFile } from "../lib/settings"

/** The settings of the standalone app that the UI can change, kept in `config.json`. */
export interface LocalSettingsStore {
  get(): LocalSettings
  /** Validates and creates the folder, remembers it in config.json. Throws an Error whose message is for the user. */
  setBackupDir(input: string): LocalSettings
  /** Writes `content` as a new file in the backup folder. */
  saveBackup(content: string, now?: Date): SavedBackup
}

export function createLocalSettings({ configDir, dataDir, home, backupDir }: { configDir: string; dataDir: string; home: string; backupDir?: string }): LocalSettingsStore {
  const configFile = join(configDir, SETTINGS_FILE)
  const defaultBackupDir = join(dataDir, "backups")
  let current = backupDir ? expandHome(backupDir, home) : defaultBackupDir

  const view = (): LocalSettings => ({ backupDir: current, defaultBackupDir, configFile, dataDir })

  return {
    get: view,

    setBackupDir(input) {
      const dir = expandHome(input.trim(), home)
      if (!isAbsolute(dir)) throw new Error("Use a full path, for example /home/you/Backups or ~/Backups")
      try {
        mkdirSync(dir, { recursive: true })
        accessSync(dir, constants.W_OK)
      } catch (err) {
        throw new Error(`Cannot write to ${dir}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`)
      }
      updateSettingsFile(configDir, { backupDir: input.trim() })
      current = dir
      return view()
    },

    saveBackup(content, now = new Date()) {
      mkdirSync(current, { recursive: true })
      const stamp = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "") // 2026-11-23-0915
      let path = join(current, `argent-backup-${stamp}.json`)
      for (let n = 2; existsSync(path); n++) path = join(current, `argent-backup-${stamp}-${n}.json`)
      writeFileSync(path, content)
      return { path, bytes: Buffer.byteLength(content) }
    },
  }
}
