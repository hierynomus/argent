import { join } from "path"

export type Platform = "linux" | "darwin" | "win32"

export interface AppDirs {
  /** `config.json` lives here */
  configDir: string
  /** the embedded database (and the lock file) live here */
  dataDir: string
}

interface Inputs {
  env: Record<string, string | undefined>
  platform: Platform
  home: string
}

/**
 * Where a locally installed Argent keeps its files.
 *
 * Config (`config.json`):
 *   ARGENT_CONFIG_DIR, else
 *   Linux and macOS:  $XDG_CONFIG_HOME/argent, else ~/.config/argent
 *   Windows:          %APPDATA%\Argent
 *
 * Data (the embedded Postgres):
 *   ARGENT_DATA_DIR (or `dataDir` in config.json, resolved by the caller), else
 *   Linux:            $XDG_DATA_HOME/argent, else ~/.local/share/argent
 *   macOS:            ~/Library/Application Support/Argent  (the platform convention)
 *   Windows:          %LOCALAPPDATA%\Argent
 */
export function resolveAppDirs({ env, platform, home }: Inputs): AppDirs {
  const nonEmpty = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined)

  const configDir =
    nonEmpty(env.ARGENT_CONFIG_DIR) ??
    (platform === "win32"
      ? join(nonEmpty(env.APPDATA) ?? join(home, "AppData", "Roaming"), "Argent")
      : join(nonEmpty(env.XDG_CONFIG_HOME) ?? join(home, ".config"), "argent"))

  const dataDir =
    nonEmpty(env.ARGENT_DATA_DIR) ??
    (platform === "win32"
      ? join(nonEmpty(env.LOCALAPPDATA) ?? join(home, "AppData", "Local"), "Argent")
      : platform === "darwin"
        ? join(home, "Library", "Application Support", "Argent")
        : join(nonEmpty(env.XDG_DATA_HOME) ?? join(home, ".local", "share"), "argent"))

  return { configDir, dataDir }
}
