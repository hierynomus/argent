import { describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { accounts, subscriptions, transactions } from "../db/schema"
import { addDays, detectSubscriptions } from "./subscriptionDetector"

let n = 0
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`
const today = () => new Date().toISOString().slice(0, 10)

async function account() {
  const [a] = await db.insert(accounts).values({ iban: `NL${uid()}`.toUpperCase(), currency: "EUR", ownerSub: "detector-test" }).returning()
  return a
}

/** Inserts debits at the given offsets (days before today) for one counterparty. */
async function payments(accountId: string, counterpartyIban: string, daysAgo: number[], amount: string | string[] = "9.99") {
  const rows = []
  for (const [i, d] of daysAgo.entries()) {
    const [row] = await db.insert(transactions).values({
      accountId, amount: Array.isArray(amount) ? amount[i] : amount, currency: "EUR", creditDebitIndicator: "DBIT",
      bookingDate: addDays(today(), -d), counterpartyIban, counterpartyName: "Streamly", importHash: `h-${uid()}`,
    }).returning()
    rows.push(row)
  }
  return rows
}

const subsOf = (accountId: string) => db.select().from(subscriptions).where(eq(subscriptions.accountId, accountId))
const linkedCount = async (subId: string) => (await db.select().from(transactions).where(eq(transactions.subscriptionId, subId))).length

describe("detectSubscriptions", () => {
  test("detects a monthly subscription and fills in its statistics", async () => {
    const a = await account(), cp = `NL${uid()}`
    await payments(a.id, cp, [90, 60, 30, 0])
    await detectSubscriptions()
    const [sub] = await subsOf(a.id)
    expect(sub).toMatchObject({
      counterpartyIban: cp, counterpartyName: "Streamly", status: "candidate",
      intervalDays: 30, intervalLabel: "monthly", medianAmount: "9.99", currency: "EUR", isActive: true,
      lastSeenDate: today(), nextExpectedDate: addDays(today(), 30),
    })
    expect(await linkedCount(sub.id)).toBe(4)
  })

  test("needs at least two payments", async () => {
    const a = await account()
    await payments(a.id, `NL${uid()}`, [0])
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(0)
  })

  test("credits are ignored (only DBIT patterns are subscriptions)", async () => {
    const a = await account(), cp = `NL${uid()}`
    for (const d of [60, 30, 0]) {
      await db.insert(transactions).values({ accountId: a.id, amount: "9.99", currency: "EUR", creditDebitIndicator: "CRDT", bookingDate: addDays(today(), -d), counterpartyIban: cp, importHash: `h-${uid()}` })
    }
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(0)
  })

  test("amounts within ±5% of the median count; outliers are excluded from the subscription", async () => {
    const a = await account(), cp = `NL${uid()}`
    const rows = await payments(a.id, cp, [90, 60, 30, 0], ["10.00", "10.30", "9.80", "25.00"]) // last one is an outlier
    await detectSubscriptions()
    const [sub] = await subsOf(a.id)
    expect(sub).toBeDefined()
    expect(await linkedCount(sub.id)).toBe(3)
    const outlier = (await db.select().from(transactions).where(eq(transactions.id, rows[3].id)))[0]
    expect(outlier.subscriptionId).toBeNull()
  })

  test("wildly varying amounts are not a subscription", async () => {
    const a = await account()
    await payments(a.id, `NL${uid()}`, [90, 60, 30, 0], ["5.00", "20.00", "50.00", "100.00"])
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(0)
  })

  test("irregular gaps are rejected, small jitter is tolerated", async () => {
    const irregular = await account(), jittery = await account()
    await payments(irregular.id, `NL${uid()}`, [200, 190, 60, 0]) // gaps 10, 130, 60
    await payments(jittery.id, `NL${uid()}`, [93, 63, 31, 0])    // gaps 30, 32, 31
    await detectSubscriptions()
    expect(await subsOf(irregular.id)).toHaveLength(0)
    const [sub] = await subsOf(jittery.id)
    expect(sub.intervalLabel).toBe("monthly")
  })

  test("weekly and yearly patterns get the right labels", async () => {
    const w = await account(), y = await account()
    await payments(w.id, `NL${uid()}`, [21, 14, 7, 0])
    await payments(y.id, `NL${uid()}`, [730, 365, 0])
    await detectSubscriptions()
    expect((await subsOf(w.id))[0].intervalLabel).toBe("weekly")
    expect((await subsOf(y.id))[0].intervalLabel).toBe("yearly")
  })

  test("a stale subscription (no payment for > 2× its interval) is inactive", async () => {
    const a = await account()
    await payments(a.id, `NL${uid()}`, [400, 370, 340])
    await detectSubscriptions()
    expect((await subsOf(a.id))[0].isActive).toBe(false)
  })

  test("the same counterparty on two accounts yields two separate subscriptions", async () => {
    const a1 = await account(), a2 = await account(), cp = `NL${uid()}`
    await payments(a1.id, cp, [60, 30, 0]); await payments(a2.id, cp, [60, 30, 0])
    await detectSubscriptions()
    expect(await subsOf(a1.id)).toHaveLength(1)
    expect(await subsOf(a2.id)).toHaveLength(1)
  })

  test("payments that are internal transfers are excluded", async () => {
    const a = await account(), cp = `NL${uid()}`
    const rows = await payments(a.id, cp, [60, 30, 0])
    for (const r of rows) await db.update(transactions).set({ transferPeerId: r.id }).where(eq(transactions.id, r.id)) // pretend linked
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(0)
  })

  test("returns the number of NEW subscriptions and is idempotent", async () => {
    const a = await account()
    await payments(a.id, `NL${uid()}`, [60, 30, 0])
    const first = await detectSubscriptions()
    expect(first).toBeGreaterThanOrEqual(1)
    const [sub] = await subsOf(a.id)
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(1)
    expect((await subsOf(a.id))[0].id).toBe(sub.id)
    expect(await linkedCount(sub.id)).toBe(3)
  })

  test("a confirmed subscription keeps its status and name while its statistics refresh", async () => {
    const a = await account(), cp = `NL${uid()}`
    await payments(a.id, cp, [60, 30, 0])
    await detectSubscriptions()
    const [sub] = await subsOf(a.id)
    await db.update(subscriptions).set({ status: "confirmed", name: "My name" }).where(eq(subscriptions.id, sub.id))

    await payments(a.id, cp, [-30], "10.10") // a new payment next month at a slightly higher price
    await detectSubscriptions()
    const [after] = await subsOf(a.id)
    expect(after).toMatchObject({ id: sub.id, status: "confirmed", name: "My name" })
    expect(after.lastSeenDate).toBe(addDays(today(), 30))
    expect(await linkedCount(sub.id)).toBe(4) // new payment attached
  })

  test("a dismissed pair is never revived and its payments stay unlinked", async () => {
    const a = await account(), cp = `NL${uid()}`
    await payments(a.id, cp, [60, 30, 0])
    await detectSubscriptions()
    const [sub] = await subsOf(a.id)
    await db.update(subscriptions).set({ status: "dismissed" }).where(eq(subscriptions.id, sub.id))
    await db.update(transactions).set({ subscriptionId: null }).where(eq(transactions.subscriptionId, sub.id))

    await detectSubscriptions()
    const [after] = await subsOf(a.id)
    expect(after.status).toBe("dismissed")
    expect(await linkedCount(sub.id)).toBe(0)
    expect((await db.select().from(subscriptions).where(and(eq(subscriptions.accountId, a.id), eq(subscriptions.counterpartyIban, cp))))).toHaveLength(1)
  })
})

describe("detectSubscriptions — payments that later turn out to be internal transfers", () => {
  async function linkedPair(accountId: string, cp: string) {
    const rows = await payments(accountId, cp, [60, 30, 0], "250.00")
    return rows
  }

  test("a candidate whose payments all became transfers is removed", async () => {
    const a = await account(), cp = `NL${uid()}`
    const rows = await linkedPair(a.id, cp)
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(1) // detected while the payments still looked external

    // ...then the transfer linker recognises them as transfers between own accounts
    for (const r of rows) await db.update(transactions).set({ transferPeerId: r.id }).where(eq(transactions.id, r.id))
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(0)
    expect((await db.select().from(transactions).where(eq(transactions.accountId, a.id))).every((t) => t.subscriptionId === null)).toBe(true)
  })

  test("a confirmed subscription is kept, but transfer payments are unlinked from it", async () => {
    const a = await account(), cp = `NL${uid()}`
    const rows = await linkedPair(a.id, cp)
    await detectSubscriptions()
    const [sub] = await subsOf(a.id)
    await db.update(subscriptions).set({ status: "confirmed" }).where(eq(subscriptions.id, sub.id))

    await db.update(transactions).set({ transferPeerId: rows[0].id }).where(eq(transactions.id, rows[0].id))
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(1)
    expect((await subsOf(a.id))[0].status).toBe("confirmed")
    const linked = (await db.select().from(transactions).where(eq(transactions.subscriptionId, sub.id))).map((t) => t.id)
    expect(linked).not.toContain(rows[0].id)
    expect(linked).toHaveLength(2)
  })

  test("genuine candidates are untouched by the cleanup", async () => {
    const a = await account()
    await payments(a.id, `NL${uid()}`, [60, 30, 0])
    await detectSubscriptions()
    await detectSubscriptions()
    expect(await subsOf(a.id)).toHaveLength(1)
  })
})
