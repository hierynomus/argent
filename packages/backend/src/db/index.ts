import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

export type DB = PostgresJsDatabase<typeof schema>

// When DATABASE_URL is unset or "memory", use an in-process PGlite instance.
// PGlite is a WASM-compiled Postgres, so the schema and queries are identical —
// no code changes needed anywhere else.
const databaseUrl = process.env.DATABASE_URL

async function createDb(): Promise<DB> {
  if (!databaseUrl || databaseUrl === "memory") {
    const { PGlite } = await import("@electric-sql/pglite")
    const { drizzle } = await import("drizzle-orm/pglite")
    const { migrate } = await import("drizzle-orm/pglite/migrator")

    const client = new PGlite()
    const db = drizzle(client, { schema })

    try {
      await migrate(db, { migrationsFolder: "./drizzle" })
      console.log("[db] In-memory PGlite ready (migrations applied)")
    } catch (err) {
      console.error(
        "[db] PGlite migration failed — run `bun run db:generate` first\n",
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
  const client = postgres(databaseUrl)
  return drizzle(client, { schema })
}

// Top-level await is supported in Bun
export const db = await createDb()
