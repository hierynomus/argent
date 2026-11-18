import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

/**
 * The development database must survive restarts and hot reloads. These run the real db module in separate
 * processes (the test process itself is forced onto an in-memory database).
 */
const srcDir = join(import.meta.dir, "..")
const probe = join(import.meta.dir, "../../test/dbProbe.ts")
const workDir = mkdtempSync(join(tmpdir(), "argent-db-test-"))
afterAll(() => rmSync(workDir, { recursive: true, force: true }))

async function run(env: Record<string, string>, ...args: string[]): Promise<{ count: number; sameClient?: boolean }> {
  const proc = Bun.spawn(["bun", "run", probe, srcDir, ...args], {
    cwd: workDir, // no bunfig.toml here: the test preload that forces DATABASE_URL=memory must not apply
    env: { ...process.env, DATABASE_URL: "", PGLITE_DATA_DIR: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  if ((await proc.exited) !== 0) throw new Error(`probe failed: ${err}`)
  return JSON.parse(out.trim().split("\n").at(-1)!)
}

describe("the development database", () => {
  test("keeps its data when the process restarts", async () => {
    const dir = join(workDir, "persistent")
    const env = { PGLITE_DATA_DIR: dir }
    expect((await run(env, "read")).count).toBe(0) // first start: empty, migrated
    expect((await run(env, "write", "NL01PERSIST0000000001")).count).toBe(1)
    expect((await run(env, "read")).count).toBe(1) // a new process sees it
    expect((await run(env, "write", "NL01PERSIST0000000002")).count).toBe(2)
    expect((await run(env, "read")).count).toBe(2)
    expect(existsSync(dir)).toBe(true)
  }, 120_000)

  test("two directories are two databases", async () => {
    const a = { PGLITE_DATA_DIR: join(workDir, "a") }
    const b = { PGLITE_DATA_DIR: join(workDir, "b") }
    await run(a, "write", "NL01SEPARATE0000000001")
    expect((await run(b, "read")).count).toBe(0)
    expect((await run(a, "read")).count).toBe(1)
  }, 120_000)

  test("a hot reload (the module evaluated again) reuses the open database instead of opening another", async () => {
    const dir = join(workDir, "hot")
    // inserts through the first evaluation and reads through the second one; two instances on one
    // directory would not see each other's data or would fail to start
    const reloaded = await run({ PGLITE_DATA_DIR: dir }, "reload", "NL01HOTRELOAD0000000001")
    expect(reloaded).toEqual({ count: 1, sameClient: true })
    expect((await run({ PGLITE_DATA_DIR: dir }, "read")).count).toBe(1) // and it reached the disk
  }, 120_000)

  test("DATABASE_URL=memory starts empty every time and writes nothing to disk", async () => {
    const dir = join(workDir, "should-not-exist")
    const env = { DATABASE_URL: "memory", PGLITE_DATA_DIR: dir }
    expect((await run(env, "write", "NL01MEMORY0000000001")).count).toBe(1)
    expect((await run(env, "read")).count).toBe(0)
    expect(existsSync(dir)).toBe(false)
  }, 120_000)

  test("a hot reload of the in-memory database keeps its data too", async () => {
    expect(await run({ DATABASE_URL: "memory" }, "reload", "NL01MEMHOT0000000001")).toEqual({ count: 1, sameClient: true })
  }, 120_000)
})
