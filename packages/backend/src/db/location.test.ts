import { describe, expect, test } from "bun:test"
import { DEFAULT_DEV_DATA_DIR, resolveDbLocation } from "./location"

describe("resolveDbLocation", () => {
  test("DATABASE_URL=memory is a throw-away in-memory database (what the tests use)", () => {
    expect(resolveDbLocation({ DATABASE_URL: "memory" })).toEqual({ kind: "memory" })
    expect(resolveDbLocation({ DATABASE_URL: "memory", PGLITE_DATA_DIR: "/somewhere" })).toEqual({ kind: "memory" }) // memory wins
  })

  test("a connection string is a real Postgres server (production)", () => {
    expect(resolveDbLocation({ DATABASE_URL: "postgresql://u:p@host:5432/db" })).toEqual({ kind: "postgres", url: "postgresql://u:p@host:5432/db" })
  })

  test("without DATABASE_URL (local development) PGlite keeps its data in a directory", () => {
    expect(resolveDbLocation({})).toEqual({ kind: "pglite", dir: DEFAULT_DEV_DATA_DIR })
    expect(resolveDbLocation({ DATABASE_URL: "" })).toEqual({ kind: "pglite", dir: DEFAULT_DEV_DATA_DIR })
    expect(DEFAULT_DEV_DATA_DIR.endsWith("packages/backend/.data/pglite")).toBe(true) // next to the package, not the working directory
  })

  test("PGLITE_DATA_DIR chooses the directory", () => {
    expect(resolveDbLocation({ PGLITE_DATA_DIR: "/tmp/my-dev-db" })).toEqual({ kind: "pglite", dir: "/tmp/my-dev-db" })
    expect(resolveDbLocation({ PGLITE_DATA_DIR: "" })).toEqual({ kind: "pglite", dir: DEFAULT_DEV_DATA_DIR })
  })
})
