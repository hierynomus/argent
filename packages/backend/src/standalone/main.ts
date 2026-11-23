import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { homedir, tmpdir } from "os"
import { join } from "path"
import { resolveAppDirs, type Platform } from "../lib/appPaths"
import { ensureSettingsFile, expandHome, readSettings, settingsToEnv } from "../lib/settings"
import { registerPgliteAssets } from "../db/pgliteAssets"
import { releaseLock, takeLock } from "./lock"
import { spaHandler, type AssetSource } from "./static"

/** Files bundled into the single executable by scripts/build-standalone.ts (absent when run from source). */
export interface Embedded {
  /** the built web app, URL path → embedded file */
  web: AssetSource
  pgliteWasm: string
  pgliteData: string
  /** migration file name (`0001_x.sql`, `meta/_journal.json`) → embedded file */
  migrations: Record<string, string>
}

const HELP = `Argent - your personal finance, on your own computer

Usage: argent [options]
  --port <n>              port of the local web server (default 47821)
  --data-dir <dir>        where the database lives
  --no-open               do not open the browser
  --print-paths           show the config file and data directory, then exit
  --exit-on-stdin-close   shut down on a "shutdown" line or when stdin closes (used by the desktop app)
  -h, --help

Settings live in <config dir>/config.json (port, dataDir, databaseUrl, coingeckoApiKey, openBrowser);
the environment (ARGENT_PORT, ARGENT_DATA_DIR, ARGENT_CONFIG_DIR, DATABASE_URL, COINGECKO_API_KEY) wins over the file.`

function parseArgs(argv: string[]) {
  const out = { port: undefined as string | undefined, dataDir: undefined as string | undefined, noOpen: false, printPaths: false, exitOnStdinClose: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--port") out.port = argv[++i]
    else if (a.startsWith("--port=")) out.port = a.slice(7)
    else if (a === "--data-dir") out.dataDir = argv[++i]
    else if (a.startsWith("--data-dir=")) out.dataDir = a.slice(11)
    else if (a === "--no-open") out.noOpen = true
    else if (a === "--print-paths") out.printPaths = true
    else if (a === "--exit-on-stdin-close") out.exitOnStdinClose = true
    else if (a === "-h" || a === "--help") out.help = true
    else throw new Error(`Unknown option ${a} (try --help)`)
  }
  return out
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url]
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref()
  } catch {
    console.log(`Open ${url} in your browser.`)
  }
}

export async function runStandalone(web: AssetSource, embedded?: Embedded): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return void console.log(HELP)

  const home = homedir()
  const dirs = resolveAppDirs({ env: process.env, platform: process.platform as Platform, home })
  ensureSettingsFile(dirs.configDir)
  const settings = readSettings(dirs.configDir)
  const dataDir = expandHome(args.dataDir ?? process.env.ARGENT_DATA_DIR ?? settings.dataDir ?? dirs.dataDir, home)

  if (args.printPaths) {
    console.log(`config file: ${join(dirs.configDir, "config.json")}\ndata dir:    ${dataDir}\ndatabase:    ${settings.databaseUrl ? "external Postgres (databaseUrl)" : join(dataDir, "db")}`)
    return
  }

  // flags beat the environment, which beats the settings file, which beats the defaults
  Object.assign(process.env, settingsToEnv(settings, process.env, dataDir))
  if (args.port) process.env.PORT = args.port
  process.env.AUTH_MODE = "local"
  process.env.ARGENT_MIGRATE_ON_START = "1"
  process.env.HOST = "127.0.0.1"
  const port = Number(process.env.PORT)
  const url = `http://127.0.0.1:${port}`

  // the embedded database must never be opened twice
  const running = takeLock(dataDir, { pid: process.pid, url })
  if (running) {
    console.log(`Argent is already running (pid ${running.pid}).`)
    console.log(`ARGENT_LISTENING ${running.url}`)
    if (!args.noOpen && settings.openBrowser !== false) openBrowser(running.url)
    return
  }

  let migrationsTmp: string | undefined
  if (embedded) {
    // the executable has no files next to it: hand PGlite its embedded WebAssembly and extract the migrations
    migrationsTmp = mkdtempSync(join(tmpdir(), "argent-migrations-"))
    for (const [name, file] of Object.entries(embedded.migrations)) {
      const target = join(migrationsTmp, name)
      mkdirSync(join(target, ".."), { recursive: true })
      writeFileSync(target, await Bun.file(file).bytes())
    }
    registerPgliteAssets({
      wasmModule: await WebAssembly.compile(await Bun.file(embedded.pgliteWasm).arrayBuffer()),
      fsBundle: Bun.file(embedded.pgliteData),
      migrationsFolder: migrationsTmp,
    })
  }

  // these modules read the environment when first imported, so only now
  const { createApp } = await import("../app")
  const { runBackgroundJobs } = await import("../services/backgroundJobs")
  const { closeDb } = await import("../db")
  const { config } = await import("../config")

  const app = createApp({ spa: spaHandler(web, { VITE_AUTH_MODE: "local" }) })
  let server: ReturnType<typeof Bun.serve>
  try {
    server = Bun.serve({ port: config.port, hostname: "127.0.0.1", fetch: app.fetch })
  } catch (err) {
    releaseLock(dataDir, process.pid)
    throw new Error(`Cannot listen on ${url}: ${(err as Error).message}. Choose another port with --port or "port" in config.json.`)
  }

  void runBackgroundJobs("startup")
  const sweep = setInterval(() => void runBackgroundJobs("periodic"), config.sweepIntervalMs)

  let stopping = false
  const stop = async (code = 0) => {
    if (stopping) return
    stopping = true
    clearInterval(sweep)
    await server.stop()
    await closeDb().catch((err) => console.error("[db] could not close cleanly:", err))
    releaseLock(dataDir, process.pid)
    if (migrationsTmp) rmSync(migrationsTmp, { recursive: true, force: true })
    process.exit(code)
  }
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => void stop())
  if (args.exitOnStdinClose) {
    // the desktop app asks politely with a line, and closing stdin (it crashed) also shuts us down
    process.stdin.on("data", (chunk) => {
      if (chunk.toString().includes("shutdown")) void stop()
    })
    process.stdin.on("end", () => void stop())
    process.stdin.resume()
  }

  console.log(`Argent is running at ${url}  (data: ${settings.databaseUrl ? "external Postgres" : join(dataDir, "db")})`)
  console.log(`ARGENT_LISTENING ${url}`)
  if (!args.noOpen && !args.exitOnStdinClose && settings.openBrowser !== false) openBrowser(url)
}
