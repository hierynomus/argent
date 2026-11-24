import { getTableColumns, eq } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { z } from "zod"
import { db, type DB } from "../db"
import * as schema from "../db/schema"

/**
 * Backup and restore, driven by ONE list: `BACKUP_ORDER`.
 *
 * Every table of the schema must be in it (`backup.test.ts` fails otherwise), in the order rows have to be
 * inserted — parents before the tables that reference them. Restore deletes in the reverse order. Adding a
 * feature with a new table means adding its key here and nothing else: the backup export, the restore, the
 * restore counts and the request validation all follow from this list.
 */
export const BACKUP_ORDER = [
  "accounts", "categories", "userProfiles", "subscriptions", "accountMembers",
  "portfolios", "portfolioMembers", "portfolioCashMovements", "cryptoTrades", "cryptoAssets", "metalLots", "metalSales",
  "stockTrades", "stockAssets", "stockDividends",
  "mortgages", "mortgageParts", "mortgageExtraPayments", "mortgagePartRates", "mortgageMembers",
  "loans", "loanParts", "loanExtraPayments", "loanPartRates", "loanMembers",
  "properties", "propertyValuations", "propertyMembers", "propertyMortgages", "propertyLoans",
  "equityPlans", "equityGrants", "equityPrices", "equityPlanMembers",
  "pensionPlans", "pensionStatements", "pensionTransfers", "pensionPlanMembers",
  "transactions", // last: it references accounts, categories and subscriptions (and itself)
] as const satisfies readonly (keyof typeof schema)[]

export type BackupKey = (typeof BACKUP_ORDER)[number]
type Row = Record<string, unknown>
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0]

const tableOf = (key: BackupKey) => schema[key] as unknown as PgTable

/** The export: every table, as the rows come out of the database. */
export async function createBackup(): Promise<Record<string, unknown>> {
  const rows = await Promise.all(BACKUP_ORDER.map((key) => db.select().from(tableOf(key))))
  return { version: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(BACKUP_ORDER.map((key, i) => [key, rows[i]])) }
}

/** Structural check of a backup file: right version, and every table (when present) is an array of objects. Row contents are enforced by the database inside the restore transaction. */
export const restoreSchema = z.looseObject({
  version: z.literal(1, { error: "Unsupported backup version" }),
  ...Object.fromEntries(BACKUP_ORDER.map((key) => [key, z.array(z.looseObject({}), { error: `${key} must be an array` }).optional()])),
})

/** JSON turns timestamps into ISO strings; Drizzle's timestamp mapper expects Date objects. */
function revive(table: PgTable, rows: Row[]): Row[] {
  const timestamps = Object.entries(getTableColumns(table)).filter(([, column]) => column.columnType === "PgTimestamp").map(([key]) => key)
  if (timestamps.length === 0) return rows
  return rows.map((row) => {
    const copy = { ...row }
    for (const key of timestamps) if (typeof copy[key] === "string") copy[key] = new Date(copy[key] as string)
    return copy
  })
}

/** Postgres allows 65535 parameters per statement: insert big tables in chunks. */
async function insertRows(tx: Tx, table: PgTable, rows: Row[]) {
  const perChunk = Math.max(1, Math.floor(30_000 / Object.keys(getTableColumns(table)).length))
  for (let i = 0; i < rows.length; i += perChunk) await tx.insert(table).values(rows.slice(i, i + perChunk) as never)
}

/** Tables whose rows refer to rows of the same table need more than one pass. */
const customInsert: Partial<Record<BackupKey, (tx: Tx, rows: Row[]) => Promise<void>>> = {
  // a category's parent must exist first: insert level by level
  categories: async (tx, rows) => {
    const inserted = new Set<string>()
    let pending = rows
    while (pending.length > 0) {
      const ready = pending.filter((r) => !r.parentId || inserted.has(r.parentId as string))
      if (ready.length === 0) throw new Error("Backup contains categories whose parent is missing")
      await insertRows(tx, schema.categories, ready)
      for (const r of ready) inserted.add(r.id as string)
      pending = pending.filter((r) => !ready.includes(r))
    }
  },
  // transfer peers and subscriptions are patched in once every transaction exists
  transactions: async (tx, rows) => {
    await insertRows(tx, schema.transactions, rows.map((t) => ({ ...t, transferPeerId: null, subscriptionId: null })))
    for (const t of rows.filter((t) => t.transferPeerId || t.subscriptionId)) {
      await tx
        .update(schema.transactions)
        .set({ transferPeerId: t.transferPeerId as string | null, subscriptionId: t.subscriptionId as string | null })
        .where(eq(schema.transactions.id, t.id as string))
    }
  },
}

/**
 * Replaces ALL data with the backup's, in one transaction (a bad row rolls everything back).
 * Returns how many rows each table now has.
 */
export async function restoreBackup(data: Partial<Record<BackupKey, Row[]>>): Promise<Record<BackupKey, number>> {
  await db.transaction(async (tx) => {
    for (const key of [...BACKUP_ORDER].reverse()) await tx.delete(tableOf(key))
    for (const key of BACKUP_ORDER) {
      const table = tableOf(key)
      const rows = revive(table, data[key] ?? [])
      if (rows.length === 0) continue
      await (customInsert[key] ? customInsert[key]!(tx, rows) : insertRows(tx, table, rows))
    }
  })
  return Object.fromEntries(BACKUP_ORDER.map((key) => [key, data[key]?.length ?? 0])) as Record<BackupKey, number>
}
