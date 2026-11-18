import { describe, expect, test } from "bun:test"
import { loadConfig } from "./config"

const prod = { NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db:5432/argent", AUTHENTIK_ISSUER: "https://a/o/x", AUTHENTIK_ADMIN_GROUP: "adm", AUTHENTIK_IMPORT_GROUP: "imp", CORS_ORIGIN: "https://app" }

describe("loadConfig", () => {
  test("a complete production environment is accepted", () => {
    expect(loadConfig(prod)).toMatchObject({ production: true, authMode: "oidc", adminGroup: "adm", importGroup: "imp", corsOrigin: "https://app", port: 3000 })
  })

  test("fake auth is refused in production", () => {
    expect(() => loadConfig({ ...prod, AUTH_MODE: "fake" })).toThrow("AUTH_MODE=fake is not allowed")
  })

  test("production needs explicit group names and CORS origin; every missing one is reported", () => {
    let message = ""
    try { loadConfig({ NODE_ENV: "production", AUTHENTIK_ISSUER: "https://a" }) } catch (e) { message = (e as Error).message }
    for (const name of ["AUTHENTIK_ADMIN_GROUP", "AUTHENTIK_IMPORT_GROUP", "CORS_ORIGIN"]) expect(message).toContain(name)
  })

  test("outside production the code defaults apply", () => {
    expect(loadConfig({ AUTHENTIK_ISSUER: "https://a" })).toMatchObject({ production: false, adminGroup: "argent-admin", importGroup: "argent-import", corsOrigin: "http://localhost:5173" })
  })

  test("the OIDC issuer is required unless auth is fake", () => {
    expect(() => loadConfig({})).toThrow("AUTHENTIK_ISSUER is required")
    expect(loadConfig({ AUTH_MODE: "fake" })).toMatchObject({ authMode: "fake", issuer: undefined })
  })

  test("bad numbers are rejected", () => {
    expect(() => loadConfig({ AUTH_MODE: "fake", PORT: "abc" })).toThrow("PORT")
    expect(() => loadConfig({ AUTH_MODE: "fake", TRANSFER_LINK_INTERVAL_MS: "0" })).toThrow("TRANSFER_LINK_INTERVAL_MS")
  })

  test("an optional CoinGecko API key is picked up (blank counts as none)", () => {
    expect(loadConfig({ AUTH_MODE: "fake", COINGECKO_API_KEY: "CG-abc" }).coingeckoApiKey).toBe("CG-abc")
    expect(loadConfig({ AUTH_MODE: "fake" }).coingeckoApiKey).toBeUndefined()
    expect(loadConfig({ AUTH_MODE: "fake", COINGECKO_API_KEY: "" }).coingeckoApiKey).toBeUndefined()
  })

  test("production needs a real database: no fallback to the embedded development one", () => {
    const { DATABASE_URL: _omit, ...withoutDb } = prod
    expect(() => loadConfig(withoutDb)).toThrow("DATABASE_URL")
    expect(() => loadConfig({ ...prod, DATABASE_URL: "memory" })).toThrow("DATABASE_URL")
    expect(() => loadConfig({ ...prod, DATABASE_URL: "" })).toThrow("DATABASE_URL")
  })

  test("outside production DATABASE_URL is optional (the development database)", () => {
    expect(() => loadConfig({ AUTH_MODE: "fake" })).not.toThrow()
  })
})
