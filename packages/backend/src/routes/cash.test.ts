import { describe, expect, test } from "bun:test"
import { clientAs, del, get, patch, post, unique, user } from "../../test/helpers"

for (const kind of ["crypto", "stocks"] as const) {
  describe(`${kind}: the cash account behind a portfolio`, () => {
    const base = `/${kind}`
    const newPortfolio = async (body: object = {}) => (await post(base, { name: unique(kind), currency: "EUR", ...body })).body.id as string
    const buyBody = (eur: string) =>
      kind === "crypto"
        ? { tradeDate: "2024-01-10", fromSymbol: "EUR", fromAmount: eur, toSymbol: "BTC", toAmount: "0.01" }
        : { tradeDate: "2024-01-10", type: "buy", symbol: "AAPL", quantity: "1", amount: eur }
    const sellBody = (eur: string) =>
      kind === "crypto"
        ? { tradeDate: "2024-02-10", fromSymbol: "BTC", fromAmount: "0.005", toSymbol: "EUR", toAmount: eur }
        : { tradeDate: "2024-02-10", type: "sell", symbol: "AAPL", quantity: "0.5", amount: eur }

    test("the account number is stored on creation and can be changed or cleared", async () => {
      const created = await post(base, { name: unique(kind), accountNumber: "NL05 TEST 0417 1643 00" })
      expect(created.body.accountNumber).toBe("NL05 TEST 0417 1643 00")
      const id = created.body.id
      expect((await patch(`${base}/${id}`, { accountNumber: "NL02 INGB 0001 2345 67" })).body.accountNumber).toBe("NL02 INGB 0001 2345 67")
      expect((await patch(`${base}/${id}`, { accountNumber: null })).body.accountNumber).toBeNull()
      expect((await get(`${base}/${id}`)).body).toMatchObject({ cash: 0, cashMovements: [] })
    })

    test("the cash follows from deposits, trades and fees", async () => {
      const id = await newPortfolio()
      expect((await post(`${base}/${id}/cash`, { movementDate: "2024-01-01", type: "deposit", amount: "1000" })).status).toBe(201)
      await post(`${base}/${id}/trades`, buyBody("400"))
      expect((await get(`${base}/${id}`)).body.cash).toBe(600)
      await post(`${base}/${id}/trades`, sellBody("150"))
      await post(`${base}/${id}/cash`, { movementDate: "2024-03-01", type: "fee", amount: "2.50", notes: "custody" })
      const d = (await get(`${base}/${id}`)).body
      expect(d.cash).toBe(747.5)
      expect(d.cashMovements.map((m: any) => m.type)).toEqual(["deposit", "fee"])
      expect(d.cashMovements[1]).toMatchObject({ amount: "2.50", notes: "custody" })
    })

    test("an opening balance counts, with movements and trades from its date on added to it", async () => {
      const id = await newPortfolio()
      expect((await patch(`${base}/${id}`, { openingCash: "250" })).status).toBe(400) // needs a date
      expect((await patch(`${base}/${id}`, { openingCash: "250", openingCashDate: "2024-01-05" })).status).toBe(200)
      await post(`${base}/${id}/cash`, { movementDate: "2023-12-01", type: "deposit", amount: "9999" }) // before: already in the 250
      await post(`${base}/${id}/cash`, { movementDate: "2024-01-05", type: "deposit", amount: "100" })
      await post(`${base}/${id}/trades`, buyBody("60"))
      expect((await get(`${base}/${id}`)).body.cash).toBe(290)
    })

    test("a movement can be removed again (unlike a trade) and the balance follows", async () => {
      const id = await newPortfolio()
      const m = (await post(`${base}/${id}/cash`, { movementDate: "2024-01-01", type: "deposit", amount: "80" })).body
      expect((await get(`${base}/${id}`)).body.cash).toBe(80)
      expect((await del(`${base}/${id}/cash/${m.id}`)).status).toBe(204)
      expect((await get(`${base}/${id}`)).body.cash).toBe(0)
      expect((await del(`${base}/${id}/cash/${m.id}`)).status).toBe(404)
    })

    test("rejects invalid movements", async () => {
      const id = await newPortfolio()
      const bad = (b: object) => post(`${base}/${id}/cash`, { movementDate: "2024-01-01", type: "deposit", amount: "10", ...b })
      expect((await bad({ type: "gift" })).status).toBe(400)
      expect((await bad({ amount: "0" })).status).toBe(400)
      expect((await bad({ amount: "-5" })).status).toBe(400)
      expect((await bad({ amount: "abc" })).status).toBe(400)
      expect((await bad({ movementDate: "yesterday" })).status).toBe(400)
    })

    test("only editors can record movements; viewers see the balance", async () => {
      const owner = clientAs(user(`cash-owner-${kind}`, ["cash-owner"]))
      const viewer = clientAs(user(`cash-viewer-${kind}`, ["cash-viewer"]))
      const stranger = clientAs(user(`cash-stranger-${kind}`, ["cash-none"]))
      const id = (await owner.post(base, { name: unique(kind) })).body.id
      await owner.post(`${base}/${id}/cash`, { movementDate: "2024-01-01", type: "deposit", amount: "10" })
      await owner.post(`${base}/${id}/members`, { groupName: "cash-viewer", role: "viewer" })
      expect((await viewer.get(`${base}/${id}`)).body.cash).toBe(10)
      const denied = await viewer.post(`${base}/${id}/cash`, { movementDate: "2024-01-02", type: "deposit", amount: "5" })
      expect(denied.status).toBe(403)
      expect((await stranger.post(`${base}/${id}/cash`, { movementDate: "2024-01-02", type: "deposit", amount: "5" })).status).toBe(403)
      expect((await viewer.get(`${base}/${id}`)).body.cash).toBe(10)
    })
  })
}

describe("stocks: dividends go into the cash account", () => {
  test("a dividend raises the cash", async () => {
    const id = (await post("/stocks", { name: unique("div"), currency: "EUR" })).body.id
    await post(`/stocks/${id}/cash`, { movementDate: "2024-01-01", type: "deposit", amount: "100" })
    await post(`/stocks/${id}/dividends`, { symbol: "AAPL", paymentDate: "2024-05-01", amount: "7.25" })
    expect((await get(`/stocks/${id}`)).body.cash).toBe(107.25)
  })
})
