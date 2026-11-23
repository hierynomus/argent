import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { z } from "zod"

/** The settings file of a local install: `<configDir>/config.json`. Every key is optional. */
export const settingsSchema = z
  .object({
    /** port of the local web server (default 47821) */
    port: z.number().int().min(1).max(65535).optional(),
    /** where the embedded database lives (default: the platform's data directory) */
    dataDir: z.string().min(1).optional(),
    /** where "Back up now" writes its files (default: <dataDir>/backups) */
    backupDir: z.string().min(1).optional(),
    /** use your own Postgres server instead of the embedded database */
    databaseUrl: z.string().min(1).optional(),
    /** optional CoinGecko demo API key (a higher rate limit) */
    coingeckoApiKey: z.string().min(1).optional(),
    /** scrypt hash of the password that unlocks the app (set from Settings → Security; never write one by hand) */
    passwordHash: z.string().min(1).optional(),
    /** open the browser on start (the command-line app; the desktop app has its own window) */
    openBrowser: z.boolean().optional(),
  })
  .strict()

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_PORT = 47821
export const SETTINGS_FILE = "config.json"

/** Reads `<configDir>/config.json`; a missing file is no settings, a broken one is an error that names the file. */
export function readSettings(configDir: string): Settings {
  const file = join(configDir, SETTINGS_FILE)
  if (!existsSync(file)) return {}
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${(err as Error).message}`)
  }
  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(file)"}: ${i.message}`).join("; ")
    throw new Error(`${file} is invalid: ${issues}`)
  }
  return parsed.data
}

/** Creates the config directory and a starter `config.json` the first time, so the user can find it. */
export function ensureSettingsFile(configDir: string): void {
  const file = join(configDir, SETTINGS_FILE)
  if (existsSync(file)) return
  mkdirSync(configDir, { recursive: true })
  writeFileSync(file, JSON.stringify({ port: DEFAULT_PORT }, null, 2) + "\n")
}

/** `~` and `~/…` mean the home directory (a JSON file has no shell to expand it). */
export function expandHome(path: string, home: string): string {
  return path === "~" ? home : path.startsWith("~/") || path.startsWith("~\\") ? join(home, path.slice(2)) : path
}

/**
 * The environment the backend is configured from, for a local install: the environment wins over the
 * settings file, which wins over the defaults. (The backend only reads `process.env`.)
 */
export function settingsToEnv(settings: Settings, env: Record<string, string | undefined>, dataDir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const set = (key: string, value: string | undefined) => {
    if (value !== undefined && (env[key] === undefined || env[key] === "")) out[key] = value
  }
  // not the generic PORT: that is often set for some other program in the same shell
  out.PORT = env.ARGENT_PORT || String(settings.port ?? DEFAULT_PORT)
  set("COINGECKO_API_KEY", settings.coingeckoApiKey)
  // an external Postgres replaces the embedded database; otherwise PGlite keeps its files in <dataDir>/db
  if (settings.databaseUrl) set("DATABASE_URL", settings.databaseUrl)
  else if (!env.DATABASE_URL) set("PGLITE_DATA_DIR", join(dataDir, "db"))
  return out
}

/** Changes keys of `config.json` and keeps everything else in it (creating the file and folder when needed). */
export function updateSettingsFile(configDir: string, change: Record<string, unknown>): void {
  const file = join(configDir, SETTINGS_FILE)
  let raw: Record<string, unknown> = {}
  if (existsSync(file)) raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
  else mkdirSync(configDir, { recursive: true })
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) delete raw[key]
    else raw[key] = value
  }
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n", { mode: 0o600 })
  // the mode above only applies to a new file; the password hash must not be readable by other users of the machine
  try {
    chmodSync(file, 0o600)
  } catch {
    // Windows has no such modes
  }
}
