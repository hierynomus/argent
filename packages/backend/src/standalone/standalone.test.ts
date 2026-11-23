import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { loadConfig } from "../config"
import { releaseLock, takeLock } from "./lock"
import { dirSource, spaHandler } from "./static"

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "argent-standalone-"))
  dirs.push(d)
  return d
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

describe("local auth mode", () => {
  test("needs no identity provider and no database URL, even in production", () => {
    expect(loadConfig({ AUTH_MODE: "local", NODE_ENV: "production" })).toMatchObject({ authMode: "local", host: "127.0.0.1" })
  })
  test("only ever listens on the loopback interface", () => {
    expect(loadConfig({ AUTH_MODE: "local" }).host).toBe("127.0.0.1")
    expect(() => loadConfig({ AUTH_MODE: "local", HOST: "0.0.0.0" })).toThrow("loopback")
    expect(loadConfig({ AUTH_MODE: "local", HOST: "localhost" }).host).toBe("127.0.0.1")
  })
  test("other modes keep listening everywhere", () => {
    expect(loadConfig({ AUTH_MODE: "fake" }).host).toBe("0.0.0.0")
  })
})

describe("spaHandler", () => {
  const root = tmp()
  mkdirSync(join(root, "assets"))
  writeFileSync(join(root, "index.html"), "<html>app</html>")
  writeFileSync(join(root, "assets", "a.js"), "console.log(1)")
  writeFileSync(join(root, "secret.txt"), "x")
  const handle = spaHandler(dirSource(root), { VITE_AUTH_MODE: "local" })

  test("serves the app with the right caching", async () => {
    const index = (await handle("/"))!
    expect(await index.text()).toContain("app")
    expect(index.headers.get("cache-control")).toBe("no-cache")
    const asset = (await handle("/assets/a.js"))!
    expect(asset.headers.get("cache-control")).toContain("immutable")
  })
  test("an unknown path is a client-side route; a missing asset is not", async () => {
    expect(await (await handle("/mortgages/123"))!.text()).toContain("app")
    expect(await handle("/assets/missing.js")).toBeNull()
    expect(await handle("/missing.png")).toBeNull()
  })
  test("tells the app to skip the login", async () => {
    const res = (await handle("/env-config.js"))!
    expect(await res.text()).toContain('"VITE_AUTH_MODE":"local"')
    expect(res.headers.get("cache-control")).toBe("no-store")
  })
  test("cannot read outside the web directory", async () => {
    expect(dirSource(join(root, "assets")).file("/../secret.txt")).toBeNull()
  })
})

describe("lock", () => {
  test("a second live instance is refused; a stale lock is taken over; release removes it", () => {
    const d = tmp()
    expect(takeLock(d, { pid: process.pid, url: "http://a" })).toBeNull()
    // another process (the parent shell is alive) holds it
    expect(takeLock(d, { pid: process.pid + 100000, url: "http://b" })).toEqual({ pid: process.pid, url: "http://a" })
    writeFileSync(join(d, "argent.lock"), JSON.stringify({ pid: 2 ** 22 + 12345, url: "http://dead" })) // no such process
    expect(takeLock(d, { pid: process.pid, url: "http://c" })).toBeNull()
    releaseLock(d, process.pid)
    expect(takeLock(d, { pid: 1, url: "http://d" })).toBeNull() // nothing left
  })
})
