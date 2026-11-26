import { describe, expect, test } from "bun:test"
import { camt, clientAs, del, get, patch, post, put, unique, uniqueIban, upload, user } from "../../test/helpers"

async function newAccount(body: Record<string, unknown> = {}) {
  const res = await post("/accounts", { name: unique("Manual "), type: "checking", currency: "EUR", ...body })
  expect(res.status).toBe(201)
  return res.body
}
const tx = (accountId: string, direction: "CRDT" | "DBIT", amount: string, extra: Record<string, unknown> = {}) =>
  post("/transactions", { accountId, bookingDate: "2026-03-01", direction, amount, ...extra })

describe("accounts entered by hand", () => {
  test("a manual account gets a placeholder IBAN, the opening balance and the right type", async () => {
    const a = await newAccount({ type: "cash", openingBalance: "50.00" })
    expect(a).toMatchObject({ source: "manual", type: "cash", balance: "50.00" })
    expect(a.iban.startsWith("manual:")).toBe(true)
  })

  test("a real IBAN is normalised and cannot be used twice", async () => {
    const iban = uniqueIban()
    const a = await newAccount({ iban: iban.toLowerCase().replace(/(....)/g, "$1 ") })
    expect(a.iban).toBe(iban)
    expect((await post("/accounts", { name: "dup", iban })).status).toBe(409)
  })

  test("a name is required", async () => {
    expect((await post("/accounts", { name: "  " })).status).toBe(400)
  })

  test("an account can be deleted with its transactions, and re-importing brings them back", async () => {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, entries: [{ amount: "12.50", ind: "DBIT", date: "2026-02-01" }] }))
    const id = ((await get("/accounts")).body as any[]).find((a) => a.iban === iban).id
    expect(((await get(`/transactions?accountId=${id}`)).body as any).total).toBeGreaterThan(0)
    expect((await del(`/accounts/${id}`)).status).toBe(204)
    expect(((await get("/accounts")).body as any[]).some((a) => a.id === id)).toBe(false)
    await upload("/import", "a.xml", camt({ iban, entries: [{ amount: "12.50", ind: "DBIT", date: "2026-02-01" }] }))
    const again = ((await get("/accounts")).body as any[]).find((a) => a.iban === iban)
    expect(again).toBeTruthy()
    expect(((await get(`/transactions?accountId=${again.id}`)).body as any).total).toBeGreaterThan(0)
  })

  test("deleting an account unlinks the transfer on the other side and keeps that account's transaction", async () => {
    const a = await newAccount()
    const b = await newAccount()
    const out = (await tx(a.id, "DBIT", "5")).body
    const inn = (await tx(b.id, "CRDT", "5")).body
    expect((await post(`/transactions/${out.id}/transfer`, { peerId: inn.id })).status).toBe(200)
    expect((await del(`/accounts/${a.id}`)).status).toBe(204)
    const rest = ((await get(`/transactions?accountId=${b.id}`)).body as any).data
    expect(rest).toHaveLength(1)
    expect(rest[0].transferPeerId).toBeNull()
  })

  test("an account has a holder and can be hidden; blank clears the holder", async () => {
    const a = await newAccount({ holder: "  Joint " })
    expect(a.holder).toBe("Joint")
    expect(a.hidden).toBe(false)
    const hide = await patch(`/accounts/${a.id}`, { hidden: true, holder: "Mirte" })
    expect(hide.body).toMatchObject({ hidden: true, holder: "Mirte" })
    const listed = ((await get("/accounts")).body as any[]).find((x) => x.id === a.id)
    expect(listed).toMatchObject({ hidden: true, holder: "Mirte" })
    expect((await patch(`/accounts/${a.id}`, { holder: "" })).body.holder).toBeNull()
  })

  test("a stranger cannot delete someone else's account", async () => {
    const a = await newAccount()
    const stranger = clientAs(user(unique("stranger-")))
    expect((await stranger.del(`/accounts/${a.id}`)).status).toBe(404)
  })

  test("someone without edit access cannot add transactions", async () => {
    const a = await newAccount()
    const stranger = clientAs(user(unique("stranger-")))
    expect((await stranger.post("/transactions", { accountId: a.id, bookingDate: "2026-01-02", direction: "DBIT", amount: "5" })).status).toBe(404)
  })
})

describe("balance history", () => {
  test("is computed from the transactions, so new, edited and deleted ones show at once", async () => {
    const a = await newAccount({ openingBalance: "100", openingBalanceDate: "2026-03-01" })
    const history = async () => (await get(`/accounts/${a.id}/balance-history`)).body as { currency: string; points: Array<{ date: string; balance: string }> }
    expect((await history()).points[0]).toEqual({ date: "2026-03-01", balance: "100.00" })

    const spent = (await tx(a.id, "DBIT", "30", { bookingDate: "2026-03-05" })).body
    const h = await history()
    expect(h.currency).toBe("EUR")
    expect(h.points.find((p) => p.date === "2026-03-05")?.balance).toBe("70.00")
    expect(h.points.at(-1)?.balance).toBe("70.00") // the same as the account's balance

    await del(`/transactions/${spent.id}`)
    expect((await history()).points.every((p) => p.balance === "100.00")).toBe(true)
  })

  test("is private to those who can see the account", async () => {
    const a = await newAccount()
    const stranger = clientAs(user(unique("stranger-")))
    expect((await stranger.get(`/accounts/${a.id}/balance-history`)).status).toBe(404)
  })
})

describe("transactions entered by hand", () => {
  test("they count in the balance, take the account's currency and can be edited and deleted", async () => {
    const a = await newAccount({ openingBalance: "100" })
    const created = await tx(a.id, "DBIT", "12.34", { description: "Lunch" })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ isManual: true, currency: "EUR", creditDebitIndicator: "DBIT", amount: "12.34" })
    const balance = async () => ((await get("/accounts")).body as any[]).find((x) => x.id === a.id).balance
    expect(await balance()).toBe("87.66")

    expect((await put(`/transactions/${created.body.id}`, { amount: "20", direction: "CRDT" })).status).toBe(200)
    expect(await balance()).toBe("120.00")

    expect((await del(`/transactions/${created.body.id}`)).status).toBe(204)
    expect(await balance()).toBe("100.00")
  })

  test("a cash withdrawal links to the cash it gives; changing the amount unlinks, deleting leaves the peer", async () => {
    const bank = await newAccount()
    const cash = await newAccount({ type: "cash" })
    const out = (await tx(bank.id, "DBIT", "40")).body
    const inn = (await tx(cash.id, "CRDT", "40")).body
    const suggestions = (await get(`/transactions/${out.id}/transfer-suggestions`)).body as any[]
    expect(suggestions.map((s) => s.id)).toContain(inn.id)
    expect((await post(`/transactions/${out.id}/transfer`, { peerId: inn.id })).status).toBe(200)

    await put(`/transactions/${out.id}`, { amount: "45" })
    expect(((await get(`/transactions?accountId=${cash.id}`)).body.data[0]).transferPeerId).toBeNull()

    await put(`/transactions/${out.id}`, { amount: "40" })
    await post(`/transactions/${out.id}/transfer`, { peerId: inn.id })
    expect((await del(`/transactions/${out.id}`)).status).toBe(204)
    expect(((await get(`/transactions?accountId=${cash.id}`)).body.data[0]).transferPeerId).toBeNull()
  })

  test("imported transactions are read-only", async () => {
    const iban = uniqueIban()
    await upload("/import", "a.xml", camt({ iban, entries: [{ amount: "9.99", ind: "DBIT", date: "2026-04-01" }] }))
    const id = ((await get("/accounts")).body as any[]).find((a) => a.iban === iban).id
    const imported = (await get(`/transactions?accountId=${id}`)).body.data[0]
    expect(imported.isManual).toBe(false)
    expect((await del(`/transactions/${imported.id}`)).status).toBe(409)
    expect((await put(`/transactions/${imported.id}`, { amount: "1" })).status).toBe(409)
  })

  test("validation", async () => {
    const a = await newAccount()
    expect((await tx(a.id, "DBIT", "5", { bookingDate: "2026-02-31" })).status).toBe(400)
    expect((await tx(a.id, "DBIT", "-5")).status).toBe(400)
    expect((await tx(a.id, "X" as any, "5")).status).toBe(400)
  })
})
