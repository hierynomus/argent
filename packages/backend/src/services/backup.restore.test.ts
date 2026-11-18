import { describe, expect, test } from "bun:test"
import { randomUUID } from "crypto"
import { get, post, unique, uniqueIban } from "../../test/helpers"

describe("restore", () => {
  test("restores tens of thousands of rows (inserts are chunked: one statement would exceed Postgres' 65535 parameters)", async () => {
    const backup = (await get("/admin/backup")).body
    const accountId = randomUUID()
    const tag = unique("bulk")
    const N = 5000 // 5000 rows × 16 columns = 80 000 parameters in one statement
    backup.accounts.push({ id: accountId, iban: uniqueIban(), name: tag, ownerSub: null, currency: "EUR", type: "checking", openingBalance: "0.00", openingBalanceDate: null, createdAt: new Date().toISOString() })
    for (let i = 0; i < N; i++) {
      backup.transactions.push({
        id: randomUUID(), accountId, amount: "1.00", currency: "EUR", creditDebitIndicator: "DBIT", bookingDate: "2024-01-01", valueDate: null,
        description: `bulk ${i}`, counterpartyName: null, counterpartyIban: null, reference: null, categoryId: null, transferPeerId: null, subscriptionId: null,
        importHash: `${tag}-${i}`, createdAt: new Date().toISOString(),
      })
    }
    const r = await post("/admin/restore", backup)
    expect(r.status).toBe(200)
    expect(r.body.restored.transactions).toBe(backup.transactions.length)
    const after = (await get("/admin/backup")).body
    expect(after.transactions.filter((t: any) => t.accountId === accountId)).toHaveLength(N)
  }, 60_000)

  test("categories are restored parents first, however deep the tree and in whatever order they are listed", async () => {
    const backup = (await get("/admin/backup")).body
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()]
    const row = (id: string, name: string, parentId: string | null) => ({ id, name, color: null, parentId, createdAt: new Date().toISOString() })
    // grandchild first, root last: a naive insert would violate the foreign key
    backup.categories.push(row(c, unique("grandchild"), b), row(b, unique("child"), a), row(a, unique("root"), null))
    const r = await post("/admin/restore", backup)
    expect(r.status).toBe(200)
    expect((await get("/admin/backup")).body.categories.map((x: any) => x.id)).toEqual(expect.arrayContaining([a, b, c]))
  })

  test("a bad row rolls the whole restore back and leaves the data as it was", async () => {
    const before = (await get("/admin/backup")).body
    const broken = structuredClone(before)
    broken.accounts.push({ id: "not-a-uuid", iban: "X" })
    expect((await post("/admin/restore", broken)).status).toBeGreaterThanOrEqual(400)
    const after = (await get("/admin/backup")).body
    expect(after.accounts.length).toBe(before.accounts.length)
    expect(after.transactions.length).toBe(before.transactions.length)
  })
})
