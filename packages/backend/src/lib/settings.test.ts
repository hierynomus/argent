import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { DEFAULT_PORT, ensureSettingsFile, expandHome, readSettings, settingsToEnv } from "./settings"

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "argent-settings-"))
  dirs.push(d)
  return d
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

describe("readSettings", () => {
  test("no file means no settings", () => expect(readSettings(join(tmp(), "missing"))).toEqual({}))

  test("reads the known keys", () => {
    const d = tmp()
    writeFileSync(join(d, "config.json"), JSON.stringify({ port: 5000, dataDir: "/data", openBrowser: false }))
    expect(readSettings(d)).toEqual({ port: 5000, dataDir: "/data", openBrowser: false })
  })

  test("a broken or unknown setting is an error that names the file", () => {
    const d = tmp()
    writeFileSync(join(d, "config.json"), "{ nope")
    expect(() => readSettings(d)).toThrow(/config\.json is not valid JSON/)
    writeFileSync(join(d, "config.json"), JSON.stringify({ port: "x" }))
    expect(() => readSettings(d)).toThrow(/config\.json is invalid: port/)
    writeFileSync(join(d, "config.json"), JSON.stringify({ prot: 5 }))
    expect(() => readSettings(d)).toThrow(/config\.json is invalid/) // a typo is not silently ignored
  })
})

test("ensureSettingsFile creates a starter file once and never overwrites it", () => {
  const d = join(tmp(), "argent")
  ensureSettingsFile(d)
  expect(JSON.parse(readFileSync(join(d, "config.json"), "utf8"))).toEqual({ port: DEFAULT_PORT })
  writeFileSync(join(d, "config.json"), '{"port":1234}')
  ensureSettingsFile(d)
  expect(readSettings(d)).toEqual({ port: 1234 })
})

describe("settingsToEnv", () => {
  test("defaults: the default port and an embedded database in <dataDir>/db", () => {
    expect(settingsToEnv({}, {}, "/data")).toEqual({ PORT: String(DEFAULT_PORT), PGLITE_DATA_DIR: join("/data", "db") })
  })

  test("the file supplies the port and the CoinGecko key; ARGENT_PORT wins; the generic PORT is ignored", () => {
    expect(settingsToEnv({ port: 5000, coingeckoApiKey: "k" }, { PORT: "3000" }, "/d")).toMatchObject({ PORT: "5000", COINGECKO_API_KEY: "k" })
    expect(settingsToEnv({ port: 5000 }, { ARGENT_PORT: "6000" }, "/d").PORT).toBe("6000")
  })

  test("the environment wins over the file for the key", () => {
    expect(settingsToEnv({ coingeckoApiKey: "file" }, { COINGECKO_API_KEY: "env" }, "/d").COINGECKO_API_KEY).toBeUndefined()
  })

  test("a databaseUrl replaces the embedded database", () => {
    const env = settingsToEnv({ databaseUrl: "postgres://x/y" }, {}, "/d")
    expect(env.DATABASE_URL).toBe("postgres://x/y")
    expect(env.PGLITE_DATA_DIR).toBeUndefined()
    expect(settingsToEnv({}, { DATABASE_URL: "postgres://env/y" }, "/d").PGLITE_DATA_DIR).toBeUndefined()
  })
})

test("expandHome", () => {
  expect(expandHome("~/Finance", "/home/me")).toBe(join("/home/me", "Finance"))
  expect(expandHome("~", "/home/me")).toBe("/home/me")
  expect(expandHome("/abs", "/home/me")).toBe("/abs")
})
