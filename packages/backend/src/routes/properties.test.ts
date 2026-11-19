import { describe, expect, test } from "bun:test"
import { clientAs, del, get, patch, post, put, unique, user } from "../../test/helpers"

const NIL = "00000000-0000-0000-0000-000000000000"
const isoToday = () => new Date().toISOString().slice(0, 10)

/** A mortgage whose balance is easy to know: interest-only parts never amortise. */
async function mortgageOwing(amount: string, client: { post: typeof post } = { post }) {
  const m = (await client.post("/mortgages", { name: unique("mo") })).body
  await client.post(`/mortgages/${m.id}/parts`, { name: "p", type: "interest_only", principal: amount, annualInterestRate: "0.04", startDate: "2020-01-01", endDate: "2060-01-01" })
  return m.id as string
}
async function loanOwing(amount: string) {
  const l = (await post("/loans", { name: unique("lo") })).body
  await post(`/loans/${l.id}/parts`, { name: "p", type: "interest_only", principal: amount, annualInterestRate: "0.04", startDate: "2020-01-01", endDate: "2060-01-01" })
  return l.id as string
}
const create = (body: object = {}) => post("/properties", { name: unique("home"), ...body })
const detail = async (id: string) => (await get("/properties")).body.find((p: any) => p.id === id)

describe("properties: create / list / update / delete", () => {
  test("a property has sensible defaults and appears in the list", async () => {
    const r = await create({ name: `  ${unique("p")} ` })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ type: "house", currency: "EUR", purchasePrice: null, purchaseDate: null, valuations: [], currentValue: null, equity: null, liabilities: [], debt: 0, isOwner: true, canEdit: true })
    expect(r.body.name).toBe(r.body.name.trim())
    expect((await detail(r.body.id)).id).toBe(r.body.id)
  })

  test("type, currency, purchase and a current value can be given at creation", async () => {
    const r = await create({ type: "apartment", currency: "USD", purchasePrice: "400000", purchaseDate: "2021-03-01", currentValue: "520000" })
    expect(r.body).toMatchObject({ type: "apartment", currency: "USD", purchasePrice: "400000.00", purchaseDate: "2021-03-01" })
    expect(r.body.valuations).toHaveLength(1)
    expect(r.body.valuations[0]).toMatchObject({ valuationDate: isoToday(), value: "520000.00", note: "Initial estimate" })
    expect(r.body).toMatchObject({ currentValue: 520000, currentValueDate: isoToday(), gainSincePurchase: 120000, equity: 520000 })
  })

  test("validation", async () => {
    expect((await post("/properties", { name: " " })).status).toBe(400)
    expect((await create({ type: "castle" })).status).toBe(400)
    expect((await create({ currency: "GBP" })).status).toBe(400)
    expect((await create({ purchasePrice: "-5" })).status).toBe(400)
    expect((await create({ purchaseDate: "2024-02-31" })).status).toBe(400)
    expect((await create({ currentValue: "abc" })).status).toBe(400)
  })

  test("update the name, type and purchase details; clear the purchase", async () => {
    const p = (await create({ purchasePrice: "300000", purchaseDate: "2020-01-01" })).body
    const r = await patch(`/properties/${p.id}`, { name: " Renamed ", type: "land", purchasePrice: "310000" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ name: "Renamed", type: "land", purchasePrice: "310000.00", purchaseDate: "2020-01-01" })
    const cleared = await patch(`/properties/${p.id}`, { purchasePrice: null, purchaseDate: null })
    expect(cleared.body).toMatchObject({ purchasePrice: null, purchaseDate: null })
    expect((await patch(`/properties/${p.id}`, {})).status).toBe(400) // nothing to update
    expect((await patch(`/properties/${NIL}`, { name: "x" })).status).toBe(404)
  })

  test("delete (owner only) removes the property with its valuations", async () => {
    const p = (await create({ currentValue: "100000" })).body
    expect((await del(`/properties/${p.id}`)).status).toBe(204)
    expect(await detail(p.id)).toBeUndefined()
    expect((await del(`/properties/${p.id}`)).status).toBe(404)
  })
})

describe("properties: valuations and the current value", () => {
  test("the latest valuation is the current value, flat until the next; gain is against the purchase price", async () => {
    const p = (await create({ purchasePrice: "400000", purchaseDate: "2020-01-01" })).body
    expect((await detail(p.id)).currentValue).toBe(400000) // no valuation yet: the purchase price
    expect((await post(`/properties/${p.id}/valuations`, { valuationDate: "2022-01-01", value: "450000", note: " WOZ 2022 " })).status).toBe(201)
    expect((await post(`/properties/${p.id}/valuations`, { valuationDate: "2024-01-01", value: "520000", note: "WOZ 2024" })).status).toBe(201)
    expect((await post(`/properties/${p.id}/valuations`, { valuationDate: "2023-01-01", value: "480000" })).status).toBe(201) // entered out of order
    const d = await detail(p.id)
    expect(d.valuations.map((v: any) => v.valuationDate)).toEqual(["2022-01-01", "2023-01-01", "2024-01-01"]) // oldest first
    expect(d.valuations[0].note).toBe("WOZ 2022")
    expect(d).toMatchObject({ currentValue: 520000, currentValueDate: "2024-01-01", gainSincePurchase: 120000 })
  })

  test("a valuation dated in the future does not count yet", async () => {
    const p = (await create({ currentValue: "300000" })).body
    await post(`/properties/${p.id}/valuations`, { valuationDate: "2099-01-01", value: "999999" })
    expect((await detail(p.id)).currentValue).toBe(300000)
  })

  test("validation, and valuations can be removed", async () => {
    const p = (await create()).body
    expect((await post(`/properties/${p.id}/valuations`, { valuationDate: "2024-13-01", value: "1" })).status).toBe(400)
    expect((await post(`/properties/${p.id}/valuations`, { valuationDate: "2024-01-01", value: "0" })).status).toBe(400)
    expect((await post(`/properties/${p.id}/valuations`, { valuationDate: "2024-01-01" })).status).toBe(400)
    expect((await post(`/properties/${NIL}/valuations`, { valuationDate: "2024-01-01", value: "1" })).status).toBe(404)

    const v = (await post(`/properties/${p.id}/valuations`, { valuationDate: "2024-01-01", value: "100000" })).body
    expect((await del(`/properties/${p.id}/valuations/${v.id}`)).status).toBe(204)
    expect((await del(`/properties/${p.id}/valuations/${v.id}`)).status).toBe(404)
    expect((await detail(p.id)).valuations).toEqual([])
  })

  test("a valuation of another property cannot be deleted through this one", async () => {
    const a = (await create({ currentValue: "100000" })).body
    const b = (await create()).body
    expect((await del(`/properties/${b.id}/valuations/${a.valuations[0].id}`)).status).toBe(404)
    expect((await detail(a.id)).valuations).toHaveLength(1)
  })
})

describe("properties: linked mortgages and loans, debt and equity", () => {
  test("linking a mortgage and a loan shows what is owed and the equity", async () => {
    const p = (await create({ currentValue: "500000" })).body
    const m = await mortgageOwing("300000")
    const l = await loanOwing("20000")
    const r = await put(`/properties/${p.id}/links`, { mortgageIds: [m], loanIds: [l] })
    expect(r.status).toBe(200)
    expect(r.body.liabilities.map((x: any) => [x.kind, x.balance])).toEqual([["mortgage", 300000], ["loan", 20000]])
    expect(r.body.liabilities[0]).toMatchObject({ id: m, monthlyPayment: 1000 }) // 4% of 300000 over 12 months
    expect(r.body).toMatchObject({ debt: 320000, equity: 180000 })
  })

  test("a closed part owes nothing any more (what was left was continued in other parts)", async () => {
    const p = (await create({ currentValue: "400000" })).body
    const m = (await post("/mortgages", { name: unique("cl") })).body
    const old = (await post(`/mortgages/${m.id}/parts`, { name: "old", type: "interest_only", principal: "300000", annualInterestRate: "0.04", startDate: "2020-01-01", endDate: "2060-01-01" })).body
    await post(`/mortgages/${m.id}/parts/${old.id}/close`, { closedOn: "2024-01-01", continuation: [{ name: "next", type: "interest_only", principal: "200000", annualInterestRate: "0.05", endDate: "2060-01-01" }] })
    const r = await put(`/properties/${p.id}/links`, { mortgageIds: [m.id] })
    expect(r.body.liabilities[0]).toMatchObject({ balance: 200000, monthlyPayment: 833.33 }) // only the continued 200,000 at 5%; 100,000 was repaid
    expect(r.body).toMatchObject({ debt: 200000, equity: 200000 })
  })

  test("a linked mortgage's rate changes count: its payment follows the new rate", async () => {
    const p = (await create({ currentValue: "400000" })).body
    const m = (await post("/mortgages", { name: unique("rc") })).body
    const part = (await post(`/mortgages/${m.id}/parts`, { name: "p", type: "interest_only", principal: "300000", annualInterestRate: "0.04", startDate: "2020-01-01", endDate: "2060-01-01" })).body
    await post(`/mortgages/${m.id}/parts/${part.id}/rates`, { effectiveDate: "2021-01-01", annualInterestRate: "0.06" })
    const r = await put(`/properties/${p.id}/links`, { mortgageIds: [m.id] })
    expect(r.body.liabilities[0]).toMatchObject({ balance: 300000, monthlyPayment: 1500 }) // 6% instead of 4%
  })

  test("equity follows the mortgage: extra payments lower the debt", async () => {
    const p = (await create({ currentValue: "500000" })).body
    const m = await mortgageOwing("300000")
    await put(`/properties/${p.id}/links`, { mortgageIds: [m] })
    const mortgage = (await get("/mortgages")).body.find((x: any) => x.id === m)
    await post(`/mortgages/${m}/parts/${mortgage.parts[0].id}/payments`, { paymentDate: "2024-01-15", amount: "50000" })
    expect(await detail(p.id)).toMatchObject({ debt: 250000, equity: 250000 })
  })

  test("links can be replaced and removed", async () => {
    const p = (await create({ currentValue: "100000" })).body
    const m1 = await mortgageOwing("10000")
    const m2 = await mortgageOwing("20000")
    await put(`/properties/${p.id}/links`, { mortgageIds: [m1] })
    expect((await put(`/properties/${p.id}/links`, { mortgageIds: [m2, m2] })).body.liabilities.map((x: any) => x.id)).toEqual([m2]) // duplicates collapse
    expect((await put(`/properties/${p.id}/links`, {})).body).toMatchObject({ liabilities: [], debt: 0, equity: 100000 })
  })

  test("a mortgage can finance several properties, and a property several mortgages", async () => {
    const m = await mortgageOwing("100000")
    const a = (await create({ currentValue: "1" })).body
    const b = (await create({ currentValue: "1" })).body
    await put(`/properties/${a.id}/links`, { mortgageIds: [m] })
    await put(`/properties/${b.id}/links`, { mortgageIds: [m] })
    expect((await detail(a.id)).debt).toBe(100000)
    expect((await detail(b.id)).debt).toBe(100000)
  })

  test("deleting the mortgage or the property removes the link, nothing else", async () => {
    const p = (await create({ currentValue: "100000" })).body
    const m = await mortgageOwing("10000")
    await put(`/properties/${p.id}/links`, { mortgageIds: [m] })
    expect((await del(`/mortgages/${m}`)).status).toBe(204)
    expect(await detail(p.id)).toMatchObject({ liabilities: [], debt: 0 })

    const m2 = await mortgageOwing("10000")
    await put(`/properties/${p.id}/links`, { mortgageIds: [m2] })
    expect((await del(`/properties/${p.id}`)).status).toBe(204)
    expect((await get("/mortgages")).body.some((x: any) => x.id === m2)).toBe(true)
  })

  test("unknown ids are rejected, and equity is unknown without a value", async () => {
    const p = (await create()).body
    expect((await put(`/properties/${p.id}/links`, { mortgageIds: [NIL] })).status).toBe(400)
    expect((await put(`/properties/${p.id}/links`, { loanIds: [NIL] })).status).toBe(400)
    expect((await put(`/properties/${p.id}/links`, { mortgageIds: ["not-an-id"] })).status).toBe(400)
    const m = await mortgageOwing("10000")
    const r = await put(`/properties/${p.id}/links`, { mortgageIds: [m] })
    expect(r.body).toMatchObject({ currentValue: null, equity: null, debt: 10000 })
    expect((await put(`/properties/${NIL}/links`, {})).status).toBe(404)
  })
})

describe("properties: who sees what", () => {
  const owner = clientAs(user("prop-owner", ["pg-owner"]))
  const viewer = clientAs(user("prop-viewer", ["pg-viewer"]))
  const editor = clientAs(user("prop-editor", ["pg-editor"]))
  const stranger = clientAs(user("prop-stranger", ["pg-none"]))

  test("a viewer sees the value but not mortgages shared with nobody; equity covers what they can see", async () => {
    const p = (await owner.post("/properties", { name: unique("home"), currentValue: "500000" })).body
    const sharedMortgage = await mortgageOwing("100000", owner)
    const privateMortgage = await mortgageOwing("200000", owner)
    await owner.put(`/properties/${p.id}/links`, { mortgageIds: [sharedMortgage, privateMortgage] })
    await owner.post(`/properties/${p.id}/members`, { groupName: "pg-viewer", role: "viewer" })
    await owner.post(`/mortgages/${sharedMortgage}/members`, { groupName: "pg-viewer", role: "viewer" })

    const asOwner = (await owner.get("/properties")).body.find((x: any) => x.id === p.id)
    expect(asOwner).toMatchObject({ debt: 300000, equity: 200000 })
    const asViewer = (await viewer.get("/properties")).body.find((x: any) => x.id === p.id)
    expect(asViewer.liabilities.map((l: any) => l.id)).toEqual([sharedMortgage])
    expect(asViewer).toMatchObject({ currentValue: 500000, debt: 100000, equity: 400000, canEdit: false })
    expect((await stranger.get("/properties")).body.some((x: any) => x.id === p.id)).toBe(false)
  })

  test("editing links as an editor leaves links to liabilities they cannot see untouched", async () => {
    const p = (await owner.post("/properties", { name: unique("home"), currentValue: "500000" })).body
    const hidden = await mortgageOwing("200000", owner)
    const visible = await mortgageOwing("100000", owner)
    await owner.put(`/properties/${p.id}/links`, { mortgageIds: [hidden, visible] })
    await owner.post(`/properties/${p.id}/members`, { groupName: "pg-editor", role: "editor" })
    await owner.post(`/mortgages/${visible}/members`, { groupName: "pg-editor", role: "viewer" })

    // the editor unlinks everything they can see ...
    const r = await editor.put(`/properties/${p.id}/links`, { mortgageIds: [] })
    expect(r.status).toBe(200)
    expect(r.body.liabilities).toEqual([])
    // ... but the owner's hidden link is still there
    expect((await owner.get("/properties")).body.find((x: any) => x.id === p.id).liabilities.map((l: any) => l.id)).toEqual([hidden])
    // and they cannot link what they cannot see
    expect((await editor.put(`/properties/${p.id}/links`, { mortgageIds: [hidden] })).status).toBe(400)
  })
})

describe("properties: backup, restore and the sharing overview", () => {
  test("a backup contains properties with valuations and links, and a restore brings them back", async () => {
    const p = (await create({ currentValue: "500000", purchasePrice: "400000", purchaseDate: "2020-01-01" })).body
    const m = await mortgageOwing("100000")
    await put(`/properties/${p.id}/links`, { mortgageIds: [m] })
    await post(`/properties/${p.id}/members`, { groupName: "backup-group", role: "viewer" })

    const res = await get("/admin/backup")
    expect(res.status).toBe(200)
    const backup = res.body
    expect(backup.properties.map((x: any) => x.id)).toContain(p.id)
    expect(backup.propertyValuations.some((v: any) => v.propertyId === p.id)).toBe(true)
    expect(backup.propertyMortgages.some((l: any) => l.propertyId === p.id && l.mortgageId === m)).toBe(true)

    const restored = await post("/admin/restore", backup)
    expect(restored.status).toBe(200)
    expect(restored.body.restored.properties).toBeGreaterThan(0)
    expect(await detail(p.id)).toMatchObject({ currentValue: 500000, debt: 100000, equity: 400000, purchasePrice: "400000.00" })
  })

  test("the admin sharing overview lists shared properties", async () => {
    const p = (await create()).body
    await post(`/properties/${p.id}/members`, { groupName: "overview-group", role: "editor" })
    const sharing = (await get("/admin/sharing")).body
    expect(sharing.properties.find((x: any) => x.id === p.id)).toMatchObject({ name: p.name, members: [{ groupName: "overview-group", role: "editor" }] })
  })
})
