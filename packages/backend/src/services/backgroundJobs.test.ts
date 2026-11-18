import { describe, expect, spyOn, test } from "bun:test"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { accounts, subscriptions, transactions } from "../db/schema"
import { addDays } from "./subscriptionDetector"
import { runBackgroundJobs, settleBackgroundJobs } from "./backgroundJobs"

let n = 0
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`
const today = () => new Date().toISOString().slice(0, 10)

async function account() {
  const [a] = await db.insert(accounts).values({ iban: `NL${uid()}`.toUpperCase(), currency: "EUR", ownerSub: "jobs-test" }).returning()
  return a
}

/** Monthly transfers A → B, each leg carrying the same EndToEndId. */
async function monthlyTransfers(from: { id: string; iban: string }, to: { id: string; iban: string }, months = 4) {
  const ids: string[] = []
  for (let i = 0; i < months; i++) {
    const date = addDays(today(), -30 * (months - 1 - i))
    const ref = `E2E-${uid()}`
    const [out] = await db.insert(transactions).values({ accountId: from.id, amount: "250.00", currency: "EUR", creditDebitIndicator: "DBIT", bookingDate: date, reference: ref, counterpartyIban: to.iban, importHash: `h-${uid()}` }).returning()
    const [inn] = await db.insert(transactions).values({ accountId: to.id, amount: "250.00", currency: "EUR", creditDebitIndicator: "CRDT", bookingDate: date, reference: ref, counterpartyIban: from.iban, importHash: `h-${uid()}` }).returning()
    ids.push(out.id, inn.id)
  }
  return ids
}

describe("runBackgroundJobs", () => {
  test("links transfers BEFORE detecting subscriptions (a monthly internal transfer is not a subscription)", async () => {
    const [a, b] = [await account(), await account()]
    const txIds = await monthlyTransfers(a, b)

    await runBackgroundJobs("test")

    const rows = await db.select().from(transactions).where(inArray(transactions.id, txIds))
    expect(rows.every((r) => r.transferPeerId !== null)).toBe(true) // all linked...
    expect(await db.select().from(subscriptions).where(eq(subscriptions.accountId, a.id))).toHaveLength(0) // ...so nothing to detect
  })

  test("queued runs execute one after another, and settle waits for all of them", async () => {
    const a = await account()
    for (const d of [60, 30, 0]) {
      await db.insert(transactions).values({ accountId: a.id, amount: "7.77", currency: "EUR", creditDebitIndicator: "DBIT", bookingDate: addDays(today(), -d), counterpartyIban: `NL${uid()}`.toUpperCase().slice(0, 18) + "X", importHash: `h-${uid()}` })
    }
    // three triggers in a row without awaiting
    void runBackgroundJobs("a"); void runBackgroundJobs("b"); void runBackgroundJobs("c")
    await settleBackgroundJobs()
    // the pattern above uses a different counterparty per row, so nothing is detected — but the runs completed cleanly
    expect(await db.select().from(subscriptions).where(eq(subscriptions.accountId, a.id))).toHaveLength(0)
  })

  test("detects subscriptions once the data is there, via the same entry point", async () => {
    const a = await account(), cp = `NL${uid()}`.toUpperCase()
    for (const d of [60, 30, 0]) {
      await db.insert(transactions).values({ accountId: a.id, amount: "7.77", currency: "EUR", creditDebitIndicator: "DBIT", bookingDate: addDays(today(), -d), counterpartyIban: cp, importHash: `h-${uid()}` })
    }
    await runBackgroundJobs("test")
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.accountId, a.id))
    expect(subs).toHaveLength(1)
    expect(subs[0].status).toBe("candidate")
  })

  test("a failing run is logged, does not reject, and does not block later runs", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {})
    const select = spyOn(db, "select").mockImplementationOnce(() => { throw new Error("database exploded") })
    try {
      await expect(runBackgroundJobs("failing")).resolves.toBeUndefined()
      expect(errors).toHaveBeenCalled()
      expect(String(errors.mock.calls[0][0])).toContain("failing")
    } finally {
      select.mockRestore()
      errors.mockRestore()
    }
    // the queue is healthy again
    await expect(runBackgroundJobs("after")).resolves.toBeUndefined()
  })

  test("settleBackgroundJobs resolves immediately when nothing is queued", async () => {
    await settleBackgroundJobs()
    await settleBackgroundJobs()
  })
})
