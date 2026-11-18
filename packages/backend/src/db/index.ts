import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { join } from "path"
import * as schema from "./schema"
import { resolveDbLocation } from "./location"

export type DB = PostgresJsDatabase<typeof schema>

// Where the database lives is decided by `resolveDbLocation` (see db/location.ts): a real Postgres in
// production, an embedded PGlite for development (persisted in a data directory, so your data survives
// restarts and hot reloads) or in memory (the tests). PGlite is a WASM-compiled Postgres, so the schema and
// queries are identical — no code changes needed anywhere else.
const location = resolveDbLocation()

/**
 * Open PGlite clients by location, kept on `globalThis`. `bun --hot` re-evaluates this module on every
 * source change; without this each reload would open a second instance on the same directory (unsafe) or
 * start an empty in-memory database (all data gone).
 */
const globalClients = globalThis as { __argentPglite?: Map<string, unknown> }

async function createDb(): Promise<DB> {
  if (location.kind !== "postgres") {
    const { PGlite } = await import("@electric-sql/pglite")
    const { drizzle } = await import("drizzle-orm/pglite")
    const { migrate } = await import("drizzle-orm/pglite/migrator")

    const clients = (globalClients.__argentPglite ??= new Map())
    const key = location.kind === "pglite" ? location.dir : ":memory:"
    let client = clients.get(key) as InstanceType<typeof PGlite> | undefined
    if (!client) {
      client = new PGlite(location.kind === "pglite" ? location.dir : undefined)
      clients.set(key, client)
    }
    const db = drizzle(client, { schema })

    try {
      // applies only the migrations this database has not seen yet, so it is safe on every (re)load
      await migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") })
      console.log(location.kind === "pglite" ? `[db] PGlite ready, data in ${location.dir} (migrations applied)` : "[db] In-memory PGlite ready (migrations applied)")
    } catch (err) {
      console.error(
        "[db] PGlite migration failed — run `bun run db:generate` first (or `bun run db:reset` to start from an empty dev database)\n",
        (err as Error).message
      )
      process.exit(1)
    }

    // PGlite and postgres-js expose the same query API; present them as one type
    // so call sites don't deal with a union of two drivers.
    return db as unknown as DB
  }

  const { default: postgres } = await import("postgres")
  const { drizzle } = await import("drizzle-orm/postgres-js")
  const client = postgres(location.url)
  return drizzle(client, { schema })
}

// Top-level await is supported in Bun
export const db = await createDb()
