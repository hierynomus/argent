import { describe, expect, test } from "bun:test"
import { clientAs, unique, user } from "../../test/helpers"

/** Everything here belongs to a user of its own, so the shared database does not matter. */
async function setup() {
  const me = clientAs(user(unique("sum-")))
  const account = (await me.post("/accounts", { name: unique("S "), type: "checking", currency: "EUR" })).body
  const other = (await me.post("/accounts", { name: unique("S2 "), type: "checking", currency: "EUR" })).body
  const food = (await me.post("/categories", { name: unique("Food ") })).body
  const fun = (await me.post("/categories", { name: unique("Fun ") })).body
  const tx = (accountId: string, bookingDate: string, direction: "CRDT" | "DBIT", amount: string, categoryId?: string) =>
    me.post("/transactions", { accountId, bookingDate, direction, amount, categoryId })
  return { me, account, other, food, fun, tx }
}

describe("GET /transactions/summary", () => {
  test("totals in and out per label over a period, transfers between own accounts left out", async () => {
    const { me, account, other, food, fun, tx } = await setup()
    await tx(account.id, "2026-03-05", "DBIT", "10.10", food.id)
    await tx(account.id, "2026-03-20", "DBIT", "20.20", food.id)
    await tx(account.id, "2026-03-21", "DBIT", "5", fun.id)
    await tx(account.id, "2026-03-22", "DBIT", "7") // unlabeled
    await tx(account.id, "2026-03-25", "CRDT", "1000")
    await tx(account.id, "2026-02-28", "DBIT", "999", food.id) // before the period
    await tx(account.id, "2026-04-01", "DBIT", "999", food.id) // after it
    // a transfer: 50 out of one account, 50 into the other (they link on their own by amount and date)
    const out = (await tx(account.id, "2026-03-10", "DBIT", "50")).body
    const inn = (await tx(other.id, "2026-03-10", "CRDT", "50")).body
    await me.post(`/transactions/${out.id}/transfer`, { peerId: inn.id })

    const res = await me.get("/transactions/summary?from=2026-03-01&to=2026-03-31")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ currency: "EUR", income: 1000, expenses: 42.3 })
    expect(res.body.byCategory).toEqual([
      { categoryId: food.id, expenses: 30.3, income: 0 },
      { categoryId: null, expenses: 7, income: 1000 },
      { categoryId: fun.id, expenses: 5, income: 0 },
    ])
  })

  test("needs a valid period, and someone who sees nothing gets zeros", async () => {
    const { me } = await setup()
    expect((await me.get("/transactions/summary")).status).toBe(400)
    expect((await me.get("/transactions/summary?from=2026-03-31&to=2026-03-01")).status).toBe(400)
    const stranger = clientAs(user(unique("sum-stranger-")))
    expect((await stranger.get("/transactions/summary?from=2026-03-01&to=2026-03-31")).body).toEqual({ from: "2026-03-01", to: "2026-03-31", currency: "EUR", income: 0, expenses: 0, byCategory: [] })
  })
})

describe("GET /transactions: more filters", () => {
  test("several labels at once, incl. unlabeled; direction; transfers; currency", async () => {
    const { me, account, food, fun, tx } = await setup()
    await tx(account.id, "2026-03-05", "DBIT", "10", food.id)
    await tx(account.id, "2026-03-06", "DBIT", "20", fun.id)
    await tx(account.id, "2026-03-07", "DBIT", "30")
    await tx(account.id, "2026-03-08", "CRDT", "40", food.id)
    const amounts = async (q: string) => ((await me.get(`/transactions?accountId=${account.id}&${q}`)).body.data as any[]).map((t) => t.amount).sort()

    expect(await amounts(`categoryIds=${food.id},${fun.id}`)).toEqual(["10.00", "20.00", "40.00"])
    expect(await amounts(`categoryIds=${food.id},uncategorized`)).toEqual(["10.00", "30.00", "40.00"])
    expect(await amounts(`categoryIds=uncategorized`)).toEqual(["30.00"])
    expect(await amounts(`categoryIds=${food.id}&direction=DBIT`)).toEqual(["10.00"])
    expect(await amounts(`direction=CRDT`)).toEqual(["40.00"])
    expect(await amounts(`currency=eur&direction=DBIT`)).toEqual(["10.00", "20.00", "30.00"])
    expect(await amounts(`currency=USD`)).toEqual([])
    expect((await me.get("/transactions?categoryIds=nope")).status).toBe(400)
    expect((await me.get("/transactions?direction=SIDEWAYS")).status).toBe(400)
  })
})
