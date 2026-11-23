import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { dataDirVersionProblem, PGLITE_POSTGRES_MAJOR } from "./pgliteVersion"

const root = mkdtempSync(join(tmpdir(), "argent-pgver-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const withVersion = (name: string, version?: string) => {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  if (version) writeFileSync(join(dir, "PG_VERSION"), version + "\n")
  return dir
}

describe("dataDirVersionProblem", () => {
  test("a new or empty directory is fine", () => {
    expect(dataDirVersionProblem(join(root, "missing"))).toBeNull()
    expect(dataDirVersionProblem(withVersion("empty"))).toBeNull()
  })
  test("the current version is fine", () => expect(dataDirVersionProblem(withVersion("current", PGLITE_POSTGRES_MAJOR))).toBeNull())
  test("another version is explained, with what to do", () => {
    const message = dataDirVersionProblem(withVersion("old", "16"))!
    expect(message).toContain("created with Postgres 16")
    expect(message).toContain(`uses Postgres ${PGLITE_POSTGRES_MAJOR}`)
    expect(message).toContain("Backup & Restore")
  })
  test("the constant is the version the installed PGlite really creates", async () => {
    const { PGlite } = await import("@electric-sql/pglite")
    const dir = join(root, "real")
    const db = new PGlite(dir)
    await db.waitReady
    await db.close()
    expect(readFileSync(join(dir, "PG_VERSION"), "utf8").trim()).toBe(PGLITE_POSTGRES_MAJOR)
  }, 30_000)
})
