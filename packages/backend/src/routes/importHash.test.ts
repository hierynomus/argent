import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"
import { camt, get, uniqueIban, upload } from "../../test/helpers"

const entry = { amount: "12.5", ind: "DBIT" as const, date: "2024-03-05", ref: "E2E-SAME", description: "Same entry", counterpartyIban: "NL02SHOP0000000001" }

describe("import dedup across accounts", () => {
  test("an identical entry on two different accounts is imported on both (it used to be skipped on the second)", async () => {
    const [a, b] = [uniqueIban(), uniqueIban()]
    const first = await upload("/import", "a.xml", camt({ iban: a, entries: [entry] }))
    const second = await upload("/import", "b.xml", camt({ iban: b, entries: [entry] }))
    expect(first.body.imported).toBe(1)
    expect(second.body.imported).toBe(1)
    expect(second.body.skipped).toBe(0)
  })

  test("re-importing the same file is still a no-op", async () => {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, entries: [entry] }))
    const again = await upload("/import", "a.xml", camt({ iban, entries: [entry] }))
    expect(again.body.imported).toBe(0)
    expect(again.body.skipped).toBe(1)
  })

  test("the same amount, date and text in the opposite direction is a different transaction", async () => {
    const iban = uniqueIban()
    const r = await upload("/import", "a.xml", camt({ iban, entries: [entry, { ...entry, ind: "CRDT" }] }))
    expect(r.body.imported).toBe(2)
  })
})

describe("migration 0019 (recompute import hashes)", () => {
  test("produces exactly the hashes the importer computes, so migrated data dedups against new imports", async () => {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, entries: [entry, { ...entry, ind: "CRDT", amount: "100" }, { ...entry, ref: "E2E-2", description: "Other" }] }))
    const [acct] = await db.select().from(accounts).where(eq(accounts.iban, iban))
    const before = await db.select({ id: transactions.id, hash: transactions.importHash }).from(transactions).where(eq(transactions.accountId, acct.id))
    expect(before).toHaveLength(3)

    // run the migration's SQL for this account's rows only (other tests' data must stay untouched)
    const sql = readFileSync("drizzle/0019_recompute_import_hash.sql", "utf8")
      .replace(/^--.*$/gm, "")
      .replace('WHERE a."id" = t."account_id"', `WHERE a."id" = t."account_id" AND t."account_id" = '${acct.id}'`)
    await db.execute(sql)

    const after = await db.select({ id: transactions.id, hash: transactions.importHash }).from(transactions).where(inArray(transactions.id, before.map((r) => r.id)))
    const byId = new Map(after.map((r) => [r.id, r.hash]))
    for (const row of before) expect(byId.get(row.id)).toBe(row.hash)
  })
})

describe("stale hashes on import", () => {
  test("importing a statement again recognises entries stored with an older hash instead of adding them twice", async () => {
    const iban = uniqueIban()
    const file = camt({ iban, entries: [{ amount: "0.71", ind: "CRDT", date: "2026-01-05" }, { amount: "9.00", ind: "DBIT", date: "2026-01-06" }] })
    await upload("/import", "a.xml", file)
    const accountId = ((await get("/accounts")).body as any[]).find((a) => a.iban === iban).id
    for (const r of await db.select().from(transactions).where(eq(transactions.accountId, accountId))) {
      await db.update(transactions).set({ importHash: `stale-${r.id}` }).where(eq(transactions.id, r.id))
    }

    const again = await upload("/import", "a.xml", file)
    expect(again.body).toMatchObject({ imported: 0, skipped: 2 })
    expect(((await get(`/transactions?accountId=${accountId}`)).body as any).total).toBe(2)
  })

  test("an existing duplicate is left alone rather than failing the import", async () => {
    const iban = uniqueIban()
    const file = camt({ iban, entries: [{ amount: "0.71", ind: "CRDT", date: "2026-01-05" }] })
    await upload("/import", "a.xml", file)
    const accountId = ((await get("/accounts")).body as any[]).find((a) => a.iban === iban).id
    const [row] = await db.select().from(transactions).where(eq(transactions.accountId, accountId))
    await db.insert(transactions).values({ ...row!, id: undefined, importHash: "stale-hash" })
    expect(((await get(`/transactions?accountId=${accountId}`)).body as any).total).toBe(2)

    const again = await upload("/import", "a.xml", file)
    expect(again.status).toBe(201)
    expect(((await get(`/transactions?accountId=${accountId}`)).body as any).total).toBe(2)
  })
})
