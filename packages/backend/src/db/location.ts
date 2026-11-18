import { join } from "path"

export type DbLocation =
  /** throw-away database: the tests, or `DATABASE_URL=memory` */
  | { kind: "memory" }
  /** an embedded Postgres (PGlite) that keeps its data in a directory: local development */
  | { kind: "pglite"; dir: string }
  /** a real Postgres server: production */
  | { kind: "postgres"; url: string }

/** `packages/backend/.data/pglite`, wherever the process was started from. */
export const DEFAULT_DEV_DATA_DIR = join(import.meta.dir, "../../.data/pglite")

/**
 * Where the database lives, from the environment:
 *   DATABASE_URL=memory         → in memory (the tests force this)
 *   DATABASE_URL=postgres://…   → that server
 *   DATABASE_URL unset or empty → local development: embedded PGlite, persisted in `PGLITE_DATA_DIR`
 *                                 (default `packages/backend/.data/pglite`), so restarts and hot reloads
 *                                 keep the data you entered
 */
export function resolveDbLocation(env: Record<string, string | undefined> = process.env): DbLocation {
  const url = env.DATABASE_URL
  if (url === "memory") return { kind: "memory" }
  if (url) return { kind: "postgres", url }
  return { kind: "pglite", dir: env.PGLITE_DATA_DIR || DEFAULT_DEV_DATA_DIR }
}
