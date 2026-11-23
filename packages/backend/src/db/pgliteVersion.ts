import { existsSync, readFileSync } from "fs"
import { join } from "path"

/**
 * The Postgres major version the bundled PGlite runs (PGlite 0.6: 19). A data directory written by another major
 * version cannot be opened ("PGlite failed to initialize properly"), so check first and explain. A test creates
 * a real database and compares, so a PGlite upgrade that changes this fails loudly instead of locking people out.
 */
export const PGLITE_POSTGRES_MAJOR = "19"

/** Returns a message for the user when `dir` holds a database of another Postgres version, otherwise null. */
export function dataDirVersionProblem(dir: string): string | null {
  const file = join(dir, "PG_VERSION")
  if (!existsSync(file)) return null // new or empty directory
  const found = readFileSync(file, "utf8").trim()
  if (found === PGLITE_POSTGRES_MAJOR) return null
  return [
    `The database in ${dir} was created with Postgres ${found}, this version of Argent uses Postgres ${PGLITE_POSTGRES_MAJOR}, and a data directory cannot be opened across versions.`,
    `To keep your data: start the previous Argent, download a backup (Admin → Backup & Restore), move ${dir} away,`,
    `then start this version (it creates a new, empty database) and restore the backup there.`,
  ].join("\n")
}
