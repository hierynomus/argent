import { beforeAll, describe, expect, spyOn, test } from "bun:test"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db } from "../db"
import { accounts, categories, transactions } from "../db/schema"
import type { AuthUser } from "../middleware/auth"
import adminRoute from "./admin"
import { app, camt, del, get, patch, post, unique, uniqueIban, upload, DEV_USER } from "../../test/helpers"

const NIL = "00000000-0000-0000-0000-000000000000"

describe("admin routes are admin-only", () => {
  const nonAdmin: AuthUser = { sub: "someone", groups: ["x"], isAdmin: false, canImport: true }
  const wrapped = new Hono<{ Variables: { user: AuthUser } }>()
  wrapped.use(async (c, next) => { c.set("user", nonAdmin); await next() })
  wrapped.route("/", adminRoute)

  const json = (method: string, body: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  test.each([
    ["GET", "/accounts", undefined],
    ["PATCH", `/accounts/${NIL}`, { ownerSub: null }],
    ["POST", `/accounts/${NIL}/members`, { groupName: "g" }],
    ["DELETE", `/accounts/${NIL}/members/g`, undefined],
    ["GET", "/sharing", undefined],
    ["GET", "/backup", undefined],
    ["POST", "/restore", { version: 1 }],
  ] as const)("%s %s → 403 for a regular user", async (method, path, body) => {
    const res = await wrapped.request(path, body === undefined ? { method } : json(method, body))
    expect(res.status).toBe(403)
  })
})

describe("account administration", () => {
  async function newAccount() {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban }))
    return (await get("/accounts")).body.find((a: any) => a.iban === iban)
  }

  test("lists accounts with members and the resolved owner profile", async () => {
    const acc = await newAccount() // owned by dev-user, whose profile is synced on first request
    await post(`/admin/accounts/${acc.id}/members`, { groupName: "family", role: "editor" })
    const found = (await get("/admin/accounts")).body.find((a: any) => a.id === acc.id)
    expect(found.members).toEqual([{ groupName: "family", role: "editor" }])
    expect(found.ownerSub).toBe(DEV_USER)
  })

  test("members: default role is viewer, role can be upgraded, and members can be revoked", async () => {
    const acc = await newAccount()
    const added = await post(`/admin/accounts/${acc.id}/members`, { groupName: "g1" })
    expect(added.status).toBe(201)
    expect(added.body).toEqual({ accountId: acc.id, groupName: "g1", role: "viewer" })
    expect((await post(`/admin/accounts/${acc.id}/members`, { groupName: "g1", role: "editor" })).body.role).toBe("editor")

    expect((await del(`/admin/accounts/${acc.id}/members/g1`)).status).toBe(204)
    const found = (await get("/admin/accounts")).body.find((a: any) => a.id === acc.id)
    expect(found.members).toEqual([])
  })

  test("member validation and unknown account", async () => {
    const acc = await newAccount()
    expect((await post(`/admin/accounts/${acc.id}/members`, { groupName: " " })).status).toBe(400)
    expect((await post(`/admin/accounts/${acc.id}/members`, { groupName: "g", role: "superuser" })).status).toBe(400)
    expect((await post(`/admin/accounts/${NIL}/members`, { groupName: "g" })).status).toBe(404)
  })

  test("ownership can be reassigned and cleared", async () => {
    const acc = await newAccount()
    expect((await patch(`/admin/accounts/${acc.id}`, { ownerSub: "someone-else" })).body.ownerSub).toBe("someone-else")
    expect((await patch(`/admin/accounts/${acc.id}`, { ownerSub: null })).body.ownerSub).toBeNull()
    expect((await patch(`/admin/accounts/${acc.id}`, {})).status).toBe(400) // ownerSub is required (null to clear)
    expect((await patch(`/admin/accounts/${NIL}`, { ownerSub: "x" })).status).toBe(404)
  })

  test("sharing overview only lists resources that are shared", async () => {
    const shared = (await post("/mortgages", { name: unique("shared") })).body
    const unshared = (await post("/mortgages", { name: unique("unshared") })).body
    await post(`/mortgages/${shared.id}/members`, { groupName: "fam", role: "editor" })
    const crypto = (await post("/crypto", { name: unique("c") })).body
    await post(`/crypto/${crypto.id}/members`, { groupName: "fam" })

    const r = (await get("/admin/sharing")).body
    expect(r.mortgages.map((m: any) => m.id)).toContain(shared.id)
    expect(r.mortgages.map((m: any) => m.id)).not.toContain(unshared.id)
    expect(r.mortgages.find((m: any) => m.id === shared.id).members).toEqual([{ groupName: "fam", role: "editor" }])
    expect(r.portfolios.find((p: any) => p.id === crypto.id)).toMatchObject({ type: "crypto" })
    expect(Array.isArray(r.loans)).toBe(true)
  })
})

describe("backup & restore", () => {
  let catName: string

  beforeAll(async () => {
    // Make sure there is something of every interesting shape: a linked transfer pair, a subscription
    // with linked transactions, categories (with a parent/child self-reference), portfolios, debts.
    catName = unique("backup-cat")
    const parent = (await post("/categories", { name: catName })).body
    await post("/categories", { name: `${catName}-child`, parentId: parent.id })

    const a = uniqueIban(), b = uniqueIban(), tag = unique("bk")
    await upload("/import", "a.xml", camt({ iban: a, entries: [{ amount: "33.00", ind: "DBIT", date: "2024-08-01", ref: `${tag}x`, counterpartyIban: b }] }))
    await upload("/import", "b.xml", camt({ iban: b, entries: [{ amount: "33.00", ind: "CRDT", date: "2024-08-01", ref: `${tag}x`, counterpartyIban: a }] }))
    await post("/import/link-transfers")

    const crypto = (await post("/crypto", { name: unique("bk") })).body
    await post(`/crypto/${crypto.id}/trades`, { tradeDate: "2024-01-01", fromSymbol: "EUR", fromAmount: "100", toSymbol: "BTC", toAmount: "0.01" })
    const loan = (await post("/loans", { name: unique("bk") })).body
    await post(`/loans/${loan.id}/parts`, { name: "p", type: "linear", principal: "1000", annualInterestRate: "0.05", startDate: "2024-01-01", endDate: "2026-01-01" })
  })

  test("backup is a downloadable JSON document containing every table", async () => {
    const res = await app.request("/api/admin/backup")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="argent-backup-\d{4}-\d{2}-\d{2}\.json"$/)
    const backup = await res.json() as any
    expect(backup.version).toBe(1)
    expect(new Date(backup.exportedAt).getTime()).not.toBeNaN()
    for (const table of ["accounts", "accountMembers", "categories", "transactions", "subscriptions", "userProfiles", "portfolios", "portfolioMembers",
      "cryptoTrades", "cryptoAssets", "metalLots", "metalSales", "stockTrades", "stockAssets", "stockDividends",
      "mortgages", "mortgageParts", "mortgageExtraPayments", "mortgageMembers", "loans", "loanParts", "loanExtraPayments", "loanMembers"]) {
      expect(Array.isArray(backup[table])).toBe(true)
    }
    expect(backup.categories.map((c: any) => c.name)).toContain(catName)
  })

  test("restore brings the database back to the backed-up state (round trip)", async () => {
    const backup = await (await app.request("/api/admin/backup")).json() as any
    const linked = backup.transactions.filter((t: any) => t.transferPeerId)
    expect(linked.length).toBeGreaterThanOrEqual(2) // the transfer pair, linked both ways

    // Change the database after the backup: add, edit and delete things
    const junk = (await post("/categories", { name: unique("added-after-backup") })).body
    const [someAccount] = await db.select().from(accounts).limit(1)
    await db.update(accounts).set({ name: "CHANGED AFTER BACKUP" }).where(eq(accounts.id, someAccount.id))

    const res = await app.request("/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) })
    expect(res.status).toBe(200)
    const out = await res.json() as any
    expect(out.ok).toBe(true)
    expect(out.restored.accounts).toBe(backup.accounts.length)
    expect(out.restored.transactions).toBe(backup.transactions.length)

    const after = await (await app.request("/api/admin/backup")).json() as any
    // Everything that existed at backup time is back, byte-for-byte (apart from the export timestamp)...
    // (row order is not guaranteed, so compare as sets)
    const canon = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).sort()
    for (const table of Object.keys(backup)) {
      if (table === "exportedAt" || table === "version") continue
      expect(canon(after[table])).toEqual(canon(backup[table]))
    }
    // ...and the post-backup changes are gone
    expect(after.categories.map((c: any) => c.id)).not.toContain(junk.id)
    expect(after.accounts.find((a: any) => a.id === someAccount.id).name).toBe(someAccount.name)
  })

  test("restore keeps transfer and subscription links intact (self-referencing foreign keys)", async () => {
    const backup = await (await app.request("/api/admin/backup")).json() as any
    await app.request("/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) })
    const txs = await db.select().from(transactions)
    const byId = new Map(txs.map((t) => [t.id, t]))
    for (const t of txs.filter((t) => t.transferPeerId)) {
      expect(byId.get(t.transferPeerId!)?.transferPeerId).toBe(t.id) // symmetric
    }
  })

  test("restoring an empty backup wipes the data, and a later restore recovers it", async () => {
    const backup = await (await app.request("/api/admin/backup")).json() as any
    const empty = await app.request("/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1 }) })
    expect(empty.status).toBe(200)
    expect(await db.select().from(accounts)).toHaveLength(0)
    expect(await db.select().from(categories)).toHaveLength(0)

    const back = await app.request("/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) })
    expect(back.status).toBe(200)
    expect((await db.select().from(accounts)).length).toBe(backup.accounts.length)
  })

  describe("rejects bad payloads without touching data", () => {
    const restore = (body: unknown) => app.request("/api/admin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const accountCount = async () => (await db.select().from(accounts)).length

    test("wrong or missing version", async () => {
      const before = await accountCount()
      const r = await restore({ version: 2, accounts: [] })
      expect(r.status).toBe(400)
      expect((await r.json() as any).error).toContain("Unsupported backup version")
      expect((await restore({ accounts: [] })).status).toBe(400)
      expect(await accountCount()).toBe(before)
    })

    test("a table that is not an array", async () => {
      const before = await accountCount()
      const r = await restore({ version: 1, accounts: "nope" })
      expect(r.status).toBe(400)
      expect((await r.json() as any).error).toContain("accounts must be an array")
      expect(await accountCount()).toBe(before)
    })

    test("a malformed row rolls the whole restore back (transaction)", async () => {
      const spy = spyOn(console, "error").mockImplementation(() => {})
      try {
        const before = await accountCount()
        expect(before).toBeGreaterThan(0)
        const r = await restore({ version: 1, accounts: [{ id: NIL, currency: "EUR" /* iban missing */ }] })
        expect(r.status).toBe(500)
        expect(await r.json()).toEqual({ error: "Internal server error" })
        expect(await accountCount()).toBe(before) // old data untouched
      } finally { spy.mockRestore() }
    })
  })
})
