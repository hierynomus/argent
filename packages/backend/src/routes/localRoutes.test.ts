import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { createApp } from "../app"
import { createLocalSettings } from "../services/localSettings"

const root = mkdtempSync(join(tmpdir(), "argent-local-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const setup = (name: string) => {
  const configDir = join(root, name, "config")
  const dataDir = join(root, name, "data")
  const app = createApp({ local: createLocalSettings({ configDir, dataDir, home: join(root, "home") }) })
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api/local${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
    return { status: res.status, body: (await res.json()) as any }
  }
  return { call, configDir, dataDir }
}

describe("/api/local (standalone app)", () => {
  test("is not there in the server deployment", async () => {
    const res = await createApp().request("/api/local/settings")
    expect(res.status).toBe(404)
  })

  test("the backup folder defaults to <data dir>/backups", async () => {
    const { call, dataDir, configDir } = setup("default")
    const { body } = await call("GET", "/settings")
    expect(body).toMatchObject({ backupDir: join(dataDir, "backups"), defaultBackupDir: join(dataDir, "backups"), dataDir, configFile: join(configDir, "config.json") })
  })

  test("choosing a folder creates it, takes effect at once and is remembered in config.json", async () => {
    const { call, configDir } = setup("choose")
    const dir = join(root, "choose", "my backups")
    const res = await call("PUT", "/settings", { backupDir: dir })
    expect(res.status).toBe(200)
    expect(res.body.backupDir).toBe(dir)
    expect(existsSync(dir)).toBe(true)
    expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"))).toEqual({ backupDir: dir })
    const saved = await call("POST", "/backup")
    expect(saved.body.path.startsWith(dir)).toBe(true)
  })

  test("~ means the home directory", async () => {
    const { call } = setup("tilde")
    const res = await call("PUT", "/settings", { backupDir: "~/Backups" })
    expect(res.body.backupDir).toBe(join(root, "home", "Backups"))
  })

  test("a relative path, an empty value or a folder that cannot be written is refused with a reason", async () => {
    const { call } = setup("bad")
    expect((await call("PUT", "/settings", { backupDir: "backups" })).body.error).toContain("full path")
    expect((await call("PUT", "/settings", { backupDir: "  " })).status).toBe(400)
    const denied = await call("PUT", "/settings", { backupDir: "/proc/argent-nope" })
    expect(denied.status).toBe(400)
    expect(denied.body.error).toContain("Cannot write")
    expect((await call("GET", "/settings")).body.backupDir).toBe(join(root, "bad", "data", "backups")) // unchanged
  })

  test("a backup is a complete JSON file; a second one never overwrites the first", async () => {
    const { call } = setup("save")
    const a = await call("POST", "/backup")
    const b = await call("POST", "/backup")
    expect(a.status).toBe(200)
    expect(a.body.path).not.toBe(b.body.path)
    const parsed = JSON.parse(readFileSync(a.body.path, "utf8"))
    expect(parsed.version).toBe(1)
    expect(Array.isArray(parsed.accounts)).toBe(true)
    expect(a.body.bytes).toBe(readFileSync(a.body.path).length)
    expect(readdirSync(join(root, "save", "data", "backups"))).toHaveLength(2)
  })
})
