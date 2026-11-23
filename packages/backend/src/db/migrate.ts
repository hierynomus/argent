import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

/**
 * Applies the pending migrations. It runs as an init container of every API replica (see the Helm chart), so
 *  - it waits for the database to accept connections (a new CloudNativePG cluster needs a minute), and
 *  - it takes a PostgreSQL advisory lock, so replicas starting together migrate one after the other
 *    (the second finds nothing left to do).
 */
const MIGRATION_LOCK_ID = 727_001 // any number; every migrator of this app must use the same one
const ATTEMPTS = Number(process.env.MIGRATE_WAIT_ATTEMPTS ?? 60)
const DELAY_MS = Number(process.env.MIGRATE_WAIT_DELAY_MS ?? 5000)

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required")
}

// a single connection: the lock belongs to the session that took it
const client = postgres(connectionString, { max: 1, onnotice: () => {} })

for (let attempt = 1; ; attempt++) {
  try {
    await client`select 1`
    break
  } catch (error) {
    if (attempt >= ATTEMPTS) throw new Error(`The database did not become reachable after ${ATTEMPTS} attempts: ${(error as Error).message}`)
    console.log(`Waiting for the database (${attempt}/${ATTEMPTS}): ${(error as Error).message}`)
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
  }
}

try {
  await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  console.log("Migrations applied successfully")
} finally {
  await client`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`.catch(() => {})
  await client.end()
}
