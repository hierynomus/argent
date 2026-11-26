import { describe, expect, test } from "bun:test"
import { clientAs, unique, user } from "../../test/helpers"

describe("GET /net-worth/history", () => {
  test("is built from the dated facts the user can see, and ends with today's figures", async () => {
    const me = clientAs(user(unique("nw-")))
    const account = (await me.post("/accounts", { name: unique("NW "), type: "checking", currency: "EUR", openingBalance: "1000", openingBalanceDate: "2024-01-01" })).body
    await me.post("/transactions", { accountId: account.id, bookingDate: "2024-02-10", direction: "DBIT", amount: "250" })
    const property = (await me.post("/properties", { name: unique("House "), type: "house", currency: "EUR", purchasePrice: "300000", purchaseDate: "2024-01-01" })).body
    await me.post(`/properties/${property.id}/valuations`, { valuationDate: "2025-01-01", value: "320000" })
    const mortgage = (await me.post("/mortgages", { name: unique("M "), currency: "EUR" })).body
    await me.post(`/mortgages/${mortgage.id}/parts`, { name: "A", type: "annuity", principal: "200000", annualInterestRate: "0.03", startDate: "2024-01-01", endDate: "2054-01-01" })

    const res = await me.get("/net-worth/history")
    expect(res.status).toBe(200)
    const { currency, points } = res.body as { currency: string; points: Array<Record<string, any>> }
    expect(currency).toBe("EUR")
    expect(points[0]!.date).toBe("2024-01-01")
    expect(points[0]).toMatchObject({ banking: 1000, property: 300000, debts: 200000, netWorth: 101000 })
    const last = points.at(-1)!
    expect(last).toMatchObject({ banking: 750, property: 320000 })
    expect(last.debts).toBeLessThan(200000) // paid down
    expect(last.netWorth).toBeCloseTo(last.banking + last.investments + last.property + last.pensions - last.debts, 2)
    // the last bank balance is the account's own balance
    expect(((await me.get("/accounts")).body as any[]).find((a) => a.id === account.id).balance).toBe("750.00")
  })

  test("someone who can see nothing gets an empty history", async () => {
    const stranger = clientAs(user(unique("nw-stranger-")))
    expect((await stranger.get("/net-worth/history")).body).toEqual({ currency: "EUR", points: [] })
  })
})
