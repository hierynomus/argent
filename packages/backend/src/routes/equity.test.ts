import { describe, expect, test } from "bun:test"
import { addMonths } from "../lib/dates"
import { del, get, patch, post, unique } from "../../test/helpers"

const NIL = "00000000-0000-0000-0000-000000000000"
const today = () => new Date().toISOString().slice(0, 10)
const monthsAgo = (n: number) => addMonths(today(), -n)

const createPlan = (body: object = {}) => post("/equity", { name: unique("co"), ...body })
const plan = async (id: string) => (await get("/equity")).body.find((p: any) => p.id === id)
/** A time-vested grant of 4800 options, 12-month cliff, 48 months, that started `started` months ago. */
const timeGrant = (started: number, over: object = {}) => ({ label: "2023 grant", grantDate: monthsAgo(started), options: "4800", strikePrice: "2", vestingType: "time", vestStart: monthsAgo(started), cliffMonths: 12, vestMonths: 48, ...over })
const exitGrant = (over: object = {}) => ({ label: "Exit tranche", grantDate: "2023-01-01", options: "1000", strikePrice: "2", vestingType: "exit", ...over })

describe("equity plans", () => {
  test("a plan is created per company, listed, renamed and deleted", async () => {
    const r = await createPlan({ name: `  ${unique("Acme")} `, currency: "USD" })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ currency: "USD", grants: [], prices: [], currentPrice: null, isOwner: true, canEdit: true })
    expect(r.body.totals).toMatchObject({ granted: 0, vested: 0, vestedValue: null })
    expect((await plan(r.body.id)).id).toBe(r.body.id)
    expect((await patch(`/equity/${r.body.id}`, { name: " Renamed ", currency: "EUR" })).body).toMatchObject({ name: "Renamed", currency: "EUR" })
    expect((await patch(`/equity/${r.body.id}`, {})).status).toBe(400)
    expect((await del(`/equity/${r.body.id}`)).status).toBe(204)
    expect(await plan(r.body.id)).toBeUndefined()
    expect((await del(`/equity/${r.body.id}`)).status).toBe(404)
    expect((await patch(`/equity/${NIL}`, { name: "x" })).status).toBe(404)
  })

  test("validation", async () => {
    expect((await post("/equity", { name: " " })).status).toBe(400)
    expect((await createPlan({ currency: "GBP" })).status).toBe(400)
  })
})

describe("equity grants and vesting", () => {
  test("a time-vested grant vests monthly after the cliff, against today's date", async () => {
    const p = (await createPlan()).body
    const r = await post(`/equity/${p.id}/grants`, timeGrant(24))
    expect(r.status).toBe(201)
    const g = r.body.grants[0]
    expect(g).toMatchObject({ label: "2023 grant", options: "4800.00", strikePrice: "2.000000", vestingType: "time", cliffMonths: 12, vestMonths: 48 })
    expect(g).toMatchObject({ vested: 2400, unvested: 2400, onExit: 0 }) // 24 of 48 months
    expect(g.nextVestingDate).toBe(addMonths(monthsAgo(24), 25))
    expect(r.body.totals).toMatchObject({ granted: 4800, vested: 2400, unvested: 2400, onExit: 0 })
  })

  test("before the cliff nothing has vested; fully vested grants have no next date", async () => {
    const p = (await createPlan()).body
    await post(`/equity/${p.id}/grants`, timeGrant(6, { label: "young" }))
    await post(`/equity/${p.id}/grants`, timeGrant(60, { label: "old" }))
    const grants = (await plan(p.id)).grants
    const young = grants.find((g: any) => g.label === "young")
    const old = grants.find((g: any) => g.label === "old")
    expect(young).toMatchObject({ vested: 0, unvested: 4800, nextVestingDate: addMonths(monthsAgo(6), 12) }) // the cliff
    expect(old).toMatchObject({ vested: 4800, unvested: 0, nextVestingDate: null })
  })

  test("an exit-only grant never vests over time; its options count as 'on exit'", async () => {
    const p = (await createPlan()).body
    const r = await post(`/equity/${p.id}/grants`, exitGrant({ vestStart: "2020-01-01", vestMonths: 12, cliffMonths: 6 })) // schedule fields are ignored
    expect(r.body.grants[0]).toMatchObject({ vestingType: "exit", vestStart: null, vestMonths: null, cliffMonths: 0, vested: 0, unvested: 0, onExit: 1000, nextVestingDate: null })
    expect(r.body.totals).toMatchObject({ granted: 1000, vested: 0, onExit: 1000 })
  })

  test("validation: time vesting needs a start and a duration, the cliff cannot exceed it", async () => {
    const p = (await createPlan()).body
    const url = `/equity/${p.id}/grants`
    expect((await post(url, { ...timeGrant(24), vestStart: undefined })).body.error).toContain("vestStart is required")
    expect((await post(url, { ...timeGrant(24), vestMonths: undefined })).body.error).toContain("vestMonths is required")
    expect((await post(url, timeGrant(24, { cliffMonths: 60 }))).body.error).toContain("cliffMonths cannot be longer")
    expect((await post(url, timeGrant(24, { options: "0" }))).status).toBe(400)
    expect((await post(url, timeGrant(24, { strikePrice: "-1" }))).status).toBe(400)
    expect((await post(url, timeGrant(24, { vestingType: "quarterly" }))).status).toBe(400)
    expect((await post(url, timeGrant(24, { grantDate: "2024-02-31" }))).status).toBe(400)
    expect((await post(url, timeGrant(24, { vestMonths: 12.5 }))).status).toBe(400)
    expect((await post(`/equity/${NIL}/grants`, timeGrant(24))).status).toBe(404)
  })

  test("a grant can be corrected; the result must still be valid, and switching to exit clears the schedule", async () => {
    const p = (await createPlan()).body
    const g = (await post(`/equity/${p.id}/grants`, timeGrant(24))).body.grants[0]
    const url = `/equity/${p.id}/grants/${g.id}`
    const fixed = await patch(url, { options: "9600", label: "Corrected" })
    expect(fixed.body.grants[0]).toMatchObject({ options: "9600.00", label: "Corrected", vested: 4800 })
    expect((await patch(url, { vestMonths: 6 })).body.error).toContain("cliffMonths cannot be longer") // cliff 12 > 6
    expect((await patch(url, { vestingType: "exit" })).body.grants[0]).toMatchObject({ vestingType: "exit", vestStart: null, vestMonths: null, cliffMonths: 0, vested: 0, onExit: 9600 })
    expect((await patch(`/equity/${p.id}/grants/${NIL}`, { options: "1" })).status).toBe(404)
  })

  test("grants can be deleted, but not through another plan", async () => {
    const a = (await createPlan()).body
    const b = (await createPlan()).body
    const g = (await post(`/equity/${a.id}/grants`, timeGrant(24))).body.grants[0]
    expect((await del(`/equity/${b.id}/grants/${g.id}`)).status).toBe(404)
    expect((await del(`/equity/${a.id}/grants/${g.id}`)).status).toBe(204)
    expect((await del(`/equity/${a.id}/grants/${g.id}`)).status).toBe(404)
    expect((await plan(a.id)).grants).toEqual([])
  })
})

describe("equity share prices and values", () => {
  test("values follow the latest price: vested value counts, exit and unvested are shown separately", async () => {
    const p = (await createPlan()).body
    await post(`/equity/${p.id}/grants`, timeGrant(24)) // 2400 vested, 2400 unvested, strike 2
    await post(`/equity/${p.id}/grants`, exitGrant()) // 1000 on exit, strike 2
    const r = await post(`/equity/${p.id}/prices`, { priceDate: monthsAgo(1), price: "12", note: " Series A " })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ currentPrice: 12, currentPriceDate: monthsAgo(1) })
    expect(r.body.prices[0].note).toBe("Series A")
    expect(r.body.totals).toMatchObject({ vestedValue: 24000, unvestedValue: 24000, onExitValue: 10000 }) // × (12 − 2) = 10 per option
    expect(r.body.grants.find((g: any) => g.label === "2023 grant")).toMatchObject({ valuePerOption: 10, vestedValue: 24000 })
  })

  test("the latest price counts, flat until the next; a future price waits; same date: the last one entered", async () => {
    const p = (await createPlan()).body
    await post(`/equity/${p.id}/grants`, timeGrant(48, { strikePrice: "0" })) // fully vested, 4800 options
    await post(`/equity/${p.id}/prices`, { priceDate: monthsAgo(12), price: "5" })
    await post(`/equity/${p.id}/prices`, { priceDate: monthsAgo(3), price: "8" })
    await post(`/equity/${p.id}/prices`, { priceDate: "2099-01-01", price: "100" })
    expect((await plan(p.id)).totals.vestedValue).toBe(38400) // 4800 × 8
    await post(`/equity/${p.id}/prices`, { priceDate: monthsAgo(3), price: "9" })
    expect((await plan(p.id)).currentPrice).toBe(9)
    expect((await plan(p.id)).prices.map((x: any) => x.priceDate)).toEqual([monthsAgo(12), monthsAgo(3), monthsAgo(3), "2099-01-01"])
  })

  test("options under water (price below strike) are worth nothing, not a negative amount", async () => {
    const p = (await createPlan()).body
    await post(`/equity/${p.id}/grants`, timeGrant(48, { strikePrice: "20" }))
    const r = await post(`/equity/${p.id}/prices`, { priceDate: monthsAgo(1), price: "12" })
    expect(r.body.grants[0]).toMatchObject({ valuePerOption: 0, vestedValue: 0 })
    expect(r.body.totals.vestedValue).toBe(0)
  })

  test("without a price the values are unknown, not zero", async () => {
    const p = (await createPlan()).body
    const r = await post(`/equity/${p.id}/grants`, timeGrant(24))
    expect(r.body.totals).toMatchObject({ vested: 2400, vestedValue: null, unvestedValue: null, onExitValue: null })
    expect(r.body.grants[0].vestedValue).toBeNull()
  })

  test("price validation and deletion", async () => {
    const p = (await createPlan()).body
    expect((await post(`/equity/${p.id}/prices`, { priceDate: "2024-13-01", price: "1" })).status).toBe(400)
    expect((await post(`/equity/${p.id}/prices`, { priceDate: "2024-01-01", price: "0" })).status).toBe(400)
    expect((await post(`/equity/${NIL}/prices`, { priceDate: "2024-01-01", price: "1" })).status).toBe(404)
    const created = (await post(`/equity/${p.id}/prices`, { priceDate: "2024-01-01", price: "3.5" })).body.prices[0]
    expect(created.price).toBe("3.500000")
    const other = (await createPlan()).body
    expect((await del(`/equity/${other.id}/prices/${created.id}`)).status).toBe(404) // not via another plan
    expect((await del(`/equity/${p.id}/prices/${created.id}`)).status).toBe(204)
    expect((await del(`/equity/${p.id}/prices/${created.id}`)).status).toBe(404)
  })
})

describe("equity: backup, restore and sharing overview", () => {
  test("a backup contains plans, grants and prices, and a restore brings them back", async () => {
    const p = (await createPlan()).body
    await post(`/equity/${p.id}/grants`, timeGrant(24))
    await post(`/equity/${p.id}/prices`, { priceDate: monthsAgo(1), price: "12" })
    await post(`/equity/${p.id}/members`, { groupName: "equity-backup", role: "viewer" })

    const backup = (await get("/admin/backup")).body
    expect(backup.equityPlans.map((x: any) => x.id)).toContain(p.id)
    expect(backup.equityGrants.some((g: any) => g.planId === p.id)).toBe(true)
    expect(backup.equityPrices.some((x: any) => x.planId === p.id)).toBe(true)

    const restored = await post("/admin/restore", backup)
    expect(restored.status).toBe(200)
    expect(restored.body.restored.equityPlans).toBeGreaterThan(0)
    expect(await plan(p.id)).toMatchObject({ currentPrice: 12, totals: { vested: 2400, vestedValue: 24000 } })
  })

  test("the admin sharing overview lists shared plans", async () => {
    const p = (await createPlan()).body
    await post(`/equity/${p.id}/members`, { groupName: "equity-overview", role: "editor" })
    const sharing = (await get("/admin/sharing")).body
    expect(sharing.equity.find((x: any) => x.id === p.id)).toMatchObject({ name: p.name, members: [{ groupName: "equity-overview", role: "editor" }] })
  })
})
