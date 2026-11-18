import { describe, expect, test } from "bun:test"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"
import { linkPair, linkTransfers } from "./transferLinker"

let n = 0
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`

async function account() {
  const [a] = await db.insert(accounts).values({ iban: `NL${uid()}`.toUpperCase(), currency: "EUR", ownerSub: "linker-test" }).returning()
  return a
}

interface Tx {
  accountId: string
  ind: "CRDT" | "DBIT"
  amount?: string
  date?: string
  reference?: string | null
  counterpartyIban?: string | null
  currency?: string
}

async function tx(t: Tx) {
  const [row] = await db.insert(transactions).values({
    accountId: t.accountId,
    amount: t.amount ?? "50.00",
    currency: t.currency ?? "EUR",
    creditDebitIndicator: t.ind,
    bookingDate: t.date ?? "2024-05-10",
    reference: t.reference === undefined ? null : t.reference,
    counterpartyIban: t.counterpartyIban ?? null,
    importHash: `h-${uid()}`,
  }).returning()
  return row
}

const reload = async (...ids: string[]) =>
  Object.fromEntries((await db.select().from(transactions).where(inArray(transactions.id, ids))).map((r) => [r.id, r.transferPeerId]))

describe("linkTransfers — strategy 1: shared EndToEndId reference", () => {
  test("links the two legs of a transfer, in both directions", async () => {
    const [a, b] = [await account(), await account()]
    const ref = `E2E-${uid()}`
    const out = await tx({ accountId: a.id, ind: "DBIT", reference: ref })
    const inn = await tx({ accountId: b.id, ind: "CRDT", reference: ref, date: "2024-05-11" })
    expect(await linkTransfers()).toBeGreaterThanOrEqual(1)
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: inn.id, [inn.id]: out.id })
  })

  test("is idempotent: a second run links nothing new for the same pair", async () => {
    const [a, b] = [await account(), await account()]
    const ref = `E2E-${uid()}`
    const out = await tx({ accountId: a.id, ind: "DBIT", reference: ref })
    const inn = await tx({ accountId: b.id, ind: "CRDT", reference: ref })
    await linkTransfers()
    await linkTransfers()
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: inn.id, [inn.id]: out.id })
  })

  test("dates up to ±3 days apart still match; 4 days do not", async () => {
    const [a, b, c] = [await account(), await account(), await account()]
    const r1 = `E2E-${uid()}`, r2 = `E2E-${uid()}`
    const near = [await tx({ accountId: a.id, ind: "DBIT", reference: r1, date: "2024-05-10" }), await tx({ accountId: b.id, ind: "CRDT", reference: r1, date: "2024-05-13" })]
    const far = [await tx({ accountId: a.id, ind: "DBIT", reference: r2, date: "2024-05-10" }), await tx({ accountId: c.id, ind: "CRDT", reference: r2, date: "2024-05-14" })]
    await linkTransfers()
    const linked = await reload(...near.map((t) => t.id), ...far.map((t) => t.id))
    expect(linked[near[0].id]).toBe(near[1].id)
    expect(linked[far[0].id]).toBeNull()
    expect(linked[far[1].id]).toBeNull()
  })

  test("different amount or currency prevents a match", async () => {
    const [a, b] = [await account(), await account()]
    const r1 = `E2E-${uid()}`, r2 = `E2E-${uid()}`
    const amt = [await tx({ accountId: a.id, ind: "DBIT", reference: r1, amount: "50.00" }), await tx({ accountId: b.id, ind: "CRDT", reference: r1, amount: "50.01" })]
    const cur = [await tx({ accountId: a.id, ind: "DBIT", reference: r2 }), await tx({ accountId: b.id, ind: "CRDT", reference: r2, currency: "USD" })]
    await linkTransfers()
    for (const t of [...amt, ...cur]) expect((await reload(t.id))[t.id]).toBeNull()
  })

  test("different references do not match, and NOTPROVIDED is never used as a shared reference", async () => {
    const [a, b] = [await account(), await account()]
    const x = [await tx({ accountId: a.id, ind: "DBIT", reference: `A-${uid()}`, amount: "61.11" }), await tx({ accountId: b.id, ind: "CRDT", reference: `B-${uid()}`, amount: "61.11" })]
    const y = [await tx({ accountId: a.id, ind: "DBIT", reference: "NOTPROVIDED", amount: "62.22" }), await tx({ accountId: b.id, ind: "CRDT", reference: "NOTPROVIDED", amount: "62.22" })]
    await linkTransfers()
    for (const t of [...x, ...y]) expect((await reload(t.id))[t.id]).toBeNull()
  })

  test("two debits sharing a reference pair with only one credit", async () => {
    const [a, b] = [await account(), await account()]
    const ref = `E2E-${uid()}`
    const d1 = await tx({ accountId: a.id, ind: "DBIT", reference: ref, amount: "70.00" })
    const d2 = await tx({ accountId: a.id, ind: "DBIT", reference: ref, amount: "70.00" })
    const c1 = await tx({ accountId: b.id, ind: "CRDT", reference: ref, amount: "70.00" })
    await linkTransfers()
    const r = await reload(d1.id, d2.id, c1.id)
    const linkedDebits = [d1.id, d2.id].filter((id) => r[id] !== null)
    expect(linkedDebits).toHaveLength(1)
    expect(r[c1.id]).toBe(linkedDebits[0])
  })

  test("already-linked transactions are left alone", async () => {
    const [a, b, c] = [await account(), await account(), await account()]
    const ref = `E2E-${uid()}`
    const out = await tx({ accountId: a.id, ind: "DBIT", reference: ref })
    const first = await tx({ accountId: b.id, ind: "CRDT", reference: ref })
    await linkTransfers()
    const second = await tx({ accountId: c.id, ind: "CRDT", reference: ref })
    await linkTransfers()
    const r = await reload(out.id, first.id, second.id)
    expect(r[out.id]).toBe(first.id)
    expect(r[second.id]).toBeNull()
  })
})

describe("linkTransfers — strategy 2: counterparty IBAN of an own account", () => {
  test("links a debit whose counterparty is another own account to the matching credit", async () => {
    const [a, b] = [await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT", counterpartyIban: b.iban, amount: "123.45", reference: "NOTPROVIDED" })
    const inn = await tx({ accountId: b.id, ind: "CRDT", counterpartyIban: a.iban, amount: "123.45", reference: "NOTPROVIDED", date: "2024-05-12" })
    await linkTransfers()
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: inn.id, [inn.id]: out.id })
  })

  test("picks the credit with the closest booking date", async () => {
    const [a, b] = [await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT", counterpartyIban: b.iban, amount: "88.00", date: "2024-05-10" })
    const far = await tx({ accountId: b.id, ind: "CRDT", amount: "88.00", date: "2024-05-13" })
    const near = await tx({ accountId: b.id, ind: "CRDT", amount: "88.00", date: "2024-05-11" })
    await linkTransfers()
    const r = await reload(out.id, far.id, near.id)
    expect(r[out.id]).toBe(near.id)
    expect(r[far.id]).toBeNull()
  })

  test("a credit on a different account than the counterparty IBAN is not used", async () => {
    const [a, b, c] = [await account(), await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT", counterpartyIban: b.iban, amount: "99.00" })
    const wrong = await tx({ accountId: c.id, ind: "CRDT", amount: "99.00" })
    await linkTransfers()
    const r = await reload(out.id, wrong.id)
    expect(r[out.id]).toBeNull()
    expect(r[wrong.id]).toBeNull()
  })

  test("payments to external IBANs are never linked", async () => {
    const [a, b] = [await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT", counterpartyIban: "NL00EXTERNAL0000001", amount: "55.55" })
    const inn = await tx({ accountId: b.id, ind: "CRDT", amount: "55.55" })
    await linkTransfers()
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: null, [inn.id]: null })
  })
})

test("linkTransfers returns a number and does not throw on an unrelated database", async () => {
  const before = await db.select().from(accounts).where(eq(accounts.ownerSub, "linker-test"))
  expect(before.length).toBeGreaterThan(0)
  expect(typeof (await linkTransfers())).toBe("number")
})

describe("linkTransfers — same-account legs", () => {
  test("a payment and its reversal on the SAME account are not a transfer between own accounts", async () => {
    const a = await account()
    const ref = `E2E-${uid()}`
    const payment = await tx({ accountId: a.id, ind: "DBIT", reference: ref, amount: "42.42" })
    const reversal = await tx({ accountId: a.id, ind: "CRDT", reference: ref, amount: "42.42" })
    await linkTransfers()
    expect(await reload(payment.id, reversal.id)).toEqual({ [payment.id]: null, [reversal.id]: null })
  })

  test("a debit whose counterparty IBAN is its own account is not linked to a credit on that account", async () => {
    const a = await account()
    const out = await tx({ accountId: a.id, ind: "DBIT", counterpartyIban: a.iban, amount: "43.43" })
    const inn = await tx({ accountId: a.id, ind: "CRDT", amount: "43.43" })
    await linkTransfers()
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: null, [inn.id]: null })
  })
})

describe("linkPair — both legs or neither", () => {
  test("links two free transactions to each other", async () => {
    const [a, b] = [await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT" })
    const inn = await tx({ accountId: b.id, ind: "CRDT" })
    expect(await linkPair(out.id, inn.id)).toBe(true)
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: inn.id, [inn.id]: out.id })
  })

  test("when the second leg was linked elsewhere meanwhile, nothing changes (the first leg is rolled back)", async () => {
    const [a, b, c] = [await account(), await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT" })
    const inn = await tx({ accountId: b.id, ind: "CRDT" })
    const other = await tx({ accountId: c.id, ind: "DBIT" })
    await db.update(transactions).set({ transferPeerId: other.id }).where(eq(transactions.id, inn.id)) // someone else got there first
    expect(await linkPair(out.id, inn.id)).toBe(false)
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: null, [inn.id]: other.id }) // out must NOT point at inn
  })

  test("when the first leg is already linked nothing changes either", async () => {
    const [a, b, c] = [await account(), await account(), await account()]
    const out = await tx({ accountId: a.id, ind: "DBIT" })
    const inn = await tx({ accountId: b.id, ind: "CRDT" })
    const other = await tx({ accountId: c.id, ind: "CRDT" })
    await db.update(transactions).set({ transferPeerId: other.id }).where(eq(transactions.id, out.id))
    expect(await linkPair(out.id, inn.id)).toBe(false)
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: other.id, [inn.id]: null })
  })

  test("two runs at the same time link a pair once and leave consistent data", async () => {
    const [a, b] = [await account(), await account()]
    const ref = `E2E-${uid()}`
    const out = await tx({ accountId: a.id, ind: "DBIT", reference: ref })
    const inn = await tx({ accountId: b.id, ind: "CRDT", reference: ref })
    await Promise.all([linkTransfers(), linkTransfers()])
    expect(await reload(out.id, inn.id)).toEqual({ [out.id]: inn.id, [inn.id]: out.id })
  })
})
