import { describe, expect, test } from "bun:test"
import { getTableName, is } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import * as schema from "../db/schema"
import { BACKUP_ORDER, createBackup, restoreSchema } from "./backup"

const schemaTables = Object.entries(schema).filter(([, value]) => is(value, PgTable)) as Array<[string, PgTable]>

describe("the backup registry covers the whole schema", () => {
  test("every table in schema.ts is in BACKUP_ORDER — a table missing here would silently be left out of backups and restores", () => {
    const missing = schemaTables.map(([key]) => key).filter((key) => !(BACKUP_ORDER as readonly string[]).includes(key))
    expect(missing).toEqual([])
  })

  test("BACKUP_ORDER names only tables that exist, once each", () => {
    const keys = new Set(schemaTables.map(([key]) => key))
    expect(BACKUP_ORDER.filter((key) => !keys.has(key))).toEqual([])
    expect(new Set(BACKUP_ORDER).size).toBe(BACKUP_ORDER.length)
  })

  test("the foreign keys are really being read (this guards the ordering test below against passing vacuously)", () => {
    expect(getForeignKeyTargets(schema.cryptoTrades)).toContain("portfolios")
    expect(getForeignKeyTargets(schema.propertyMortgages).sort()).toEqual(["mortgages", "properties"])
    expect(getForeignKeyTargets(schema.equityGrants)).toEqual(["equity_plans"])
  })

  test("rows are inserted after the rows they reference (parents first), so a restore never violates a foreign key", () => {
    const position = new Map<string, number>(BACKUP_ORDER.map((key, i) => [key, i]))
    const byDbName = new Map(schemaTables.map(([key, table]) => [getTableName(table), key]))
    for (const [key, table] of schemaTables) {
      for (const fk of getForeignKeyTargets(table)) {
        const parent = byDbName.get(fk)
        if (!parent || parent === key) continue // self-references are handled by the table's own insert
        expect({ child: key, parent, ok: position.get(parent)! < position.get(key)! }).toEqual({ child: key, parent, ok: true })
      }
    }
  })
})

/** The database names of the tables a table has foreign keys to. */
function getForeignKeyTargets(table: PgTable): string[] {
  const fks = (table as any)[Symbol.for("drizzle:PgInlineForeignKeys")] as Array<{ reference: () => { foreignTable: PgTable } }> | undefined
  return (fks ?? []).map((fk) => getTableName(fk.reference().foreignTable))
}

describe("createBackup / restoreSchema", () => {
  test("a backup has a version and every table", async () => {
    const backup = await createBackup()
    expect(backup.version).toBe(1)
    for (const key of BACKUP_ORDER) expect(Array.isArray(backup[key])).toBe(true)
  })

  test("the restore schema accepts a backup and names the offending table in its message", () => {
    expect(restoreSchema.safeParse({ version: 1, accounts: [] }).success).toBe(true)
    expect(restoreSchema.safeParse({ version: 2 }).success).toBe(false)
    const bad = restoreSchema.safeParse({ version: 1, equityGrants: "nope" })
    expect(bad.success).toBe(false)
    expect(JSON.stringify(bad.error?.issues)).toContain("equityGrants must be an array")
  })
})
