import { describe, expect, test } from "bun:test"
import { clientAs, del, get, patch, post, unique, user } from "../../test/helpers"

const NIL = "00000000-0000-0000-0000-000000000000"
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

const createPlan = (body: object = {}) => post("/pensions", { name: unique("pf"), kind: "occupational_dc", ...body })
const plan = async (id: string) => (await get("/pensions")).body.find((p: any) => p.id === id)

describe("pension plans", () => {
  test("created, listed, edited and deleted", async () => {
    const r = await createPlan({ name: `  ${unique("Fund")} `, provider: " ABC ", retirementDate: "2050-01-01" })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ kind: "occupational_dc", provider: "ABC", status: "active", state: "active", currency: "EUR", closedOn: null, retirementDate: "2050-01-01", statements: [], transfers: [], isOwner: true, canEdit: true, netWorthValue: 0, capital: null })
    expect((await plan(r.body.id)).id).toBe(r.body.id)
    expect((await patch(`/pensions/${r.body.id}`, { name: " Renamed ", status: "frozen", provider: null })).body).toMatchObject({ name: "Renamed", status: "frozen", state: "frozen", provider: null })
    expect((await patch(`/pensions/${r.body.id}`, {})).status).toBe(400)
    expect((await patch(`/pensions/${NIL}`, { name: "x" })).status).toBe(404)
    expect((await del(`/pensions/${r.body.id}`)).status).toBe(204)
    expect(await plan(r.body.id)).toBeUndefined()
  })

  test("pots count in net worth by default, rights and the state pension do not (and it can be changed)", async () => {
    const counts = async (kind: string, over: object = {}) => (await createPlan({ kind, ...over })).body.countInNetWorth
    expect(await counts("occupational_dc")).toBe(true)
    expect(await counts("personal")).toBe(true)
    expect(await counts("occupational_db")).toBe(false)
    expect(await counts("state")).toBe(false)
    expect(await counts("occupational_dc", { countInNetWorth: false })).toBe(false)
  })

  test("validation", async () => {
    expect((await post("/pensions", { name: "x" })).status).toBe(400) // no kind
    expect((await createPlan({ kind: "nope" })).status).toBe(400)
    expect((await createPlan({ currency: "GBP" })).status).toBe(400)
    expect((await createPlan({ status: "closed" })).status).toBe(400) // closing is a date
    expect((await createPlan({ name: " " })).status).toBe(400)
  })
})

describe("pension statements", () => {
  test("a capital statement: the latest one dated today or earlier counts, flat until the next", async () => {
    const p = (await createPlan()).body
    await post(`/pensions/${p.id}/statements`, { statementDate: day(-400), capital: "10000" })
    const r = await post(`/pensions/${p.id}/statements`, { statementDate: day(-30), capital: "12500.50", note: " UPO " })
    expect(r.status).toBe(201)
    expect(r.body.statements.map((s: any) => s.capital)).toEqual(["10000.00", "12500.50"])
    expect(r.body).toMatchObject({ capital: 12500.5, netWorthValue: 12500.5 })
    expect(r.body.latestStatement).toMatchObject({ note: "UPO", inTodaysMoney: true })
    // a statement dated in the future does not count yet
    const later = await post(`/pensions/${p.id}/statements`, { statementDate: day(30), capital: "99999" })
    expect(later.body.capital).toBe(12500.5)
  })

  test("rights: accrued income and the three scenarios; expected income falls back to what is accrued", async () => {
    const p = (await createPlan({ kind: "occupational_db" })).body
    const a = await post(`/pensions/${p.id}/statements`, { statementDate: day(-10), accruedIncome: "8000", partnerIncome: "5600" })
    expect(a.body).toMatchObject({ accruedIncome: 8000, expectedIncome: 8000, incomeLow: null, incomeHigh: null, partnerIncome: 5600, capital: null, netWorthValue: 0 })
    const b = await post(`/pensions/${p.id}/statements`, { statementDate: day(-5), accruedIncome: "8000", projectedLow: "20000", projectedExpected: "24000", projectedHigh: "28000", inTodaysMoney: false })
    expect(b.body).toMatchObject({ expectedIncome: 24000, incomeLow: 20000, incomeHigh: 28000, incomeInTodaysMoney: false })
  })

  test("needs a figure, and the scenarios must be in order", async () => {
    const p = (await createPlan()).body
    expect((await post(`/pensions/${p.id}/statements`, { statementDate: day(-1) })).status).toBe(400)
    expect((await post(`/pensions/${p.id}/statements`, { statementDate: day(-1), projectedLow: "30", projectedExpected: "20" })).status).toBe(400)
    expect((await post(`/pensions/${p.id}/statements`, { statementDate: day(-1), capital: "-5" })).status).toBe(400)
    expect((await post(`/pensions/${p.id}/statements`, { statementDate: "2024-02-31", capital: "5" })).status).toBe(400)
    expect((await post(`/pensions/${NIL}/statements`, { statementDate: day(-1), capital: "5" })).status).toBe(404)
  })

  test("deleting a statement", async () => {
    const p = (await createPlan()).body
    const s = (await post(`/pensions/${p.id}/statements`, { statementDate: day(-1), capital: "5" })).body.statements[0]
    expect((await del(`/pensions/${p.id}/statements/${s.id}`)).status).toBe(204)
    expect((await del(`/pensions/${p.id}/statements/${s.id}`)).status).toBe(404)
    expect((await plan(p.id)).statements).toEqual([])
  })
})

describe("closing a plan", () => {
  test("a closed plan stops counting in net worth; a closing date in the future does not yet", async () => {
    const p = (await createPlan()).body
    await post(`/pensions/${p.id}/statements`, { statementDate: day(-30), capital: "1000" })
    expect((await patch(`/pensions/${p.id}`, { closedOn: day(10) })).body).toMatchObject({ state: "active", netWorthValue: 1000 })
    expect((await patch(`/pensions/${p.id}`, { closedOn: day(-1) })).body).toMatchObject({ state: "closed", netWorthValue: 0, capital: 1000 })
    expect((await patch(`/pensions/${p.id}`, { closedOn: null })).body).toMatchObject({ state: "active", netWorthValue: 1000 }) // reopened
  })

  test("a plan that does not count in net worth adds nothing", async () => {
    const p = (await createPlan({ countInNetWorth: false })).body
    expect((await post(`/pensions/${p.id}/statements`, { statementDate: day(-1), capital: "1000" })).body).toMatchObject({ capital: 1000, netWorthValue: 0 })
    expect((await patch(`/pensions/${p.id}`, { countInNetWorth: true })).body.netWorthValue).toBe(1000)
  })
})

describe("pension transfers", () => {
  const setup = async () => {
    const from = (await createPlan({ name: unique("Old"), kind: "occupational_db" })).body
    const to = (await createPlan({ name: unique("New") })).body
    return { from, to }
  }

  test("a transfer links the plans and closes the old one on that date", async () => {
    const { from, to } = await setup()
    const r = await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: to.id, transferDate: day(-5), kind: "conversion", capital: "40000", incomeGivenUp: "6000", note: " Wtp " })
    expect(r.status).toBe(201)
    const [oldPlan, newPlan] = ["from", "to"].map((side) => r.body.find((p: any) => p.id === (side === "from" ? from.id : to.id)))
    expect(oldPlan).toMatchObject({ state: "closed", closedOn: day(-5) })
    expect(newPlan.state).toBe("active")
    for (const p of [oldPlan, newPlan]) expect(p.transfers).toEqual([expect.objectContaining({ fromPlanId: from.id, toPlanId: to.id, fromPlanName: from.name, toPlanName: to.name, kind: "conversion", capital: "40000.00", incomeGivenUp: "6000.00", note: "Wtp" })])
  })

  test("closeFrom: false leaves the old plan open (it may just be frozen)", async () => {
    const { from, to } = await setup()
    const r = await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: to.id, transferDate: day(-5), kind: "transfer", capital: "1000", closeFrom: false })
    expect(r.body.find((p: any) => p.id === from.id)).toMatchObject({ state: "active", closedOn: null })
  })

  test("a partial transfer: a plan can send value to several plans", async () => {
    const { from, to } = await setup()
    const other = (await createPlan()).body
    await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: to.id, transferDate: day(-9), kind: "transfer", capital: "100", closeFrom: false })
    await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: other.id, transferDate: day(-8), kind: "transfer", capital: "200", closeFrom: false })
    expect((await plan(from.id)).transfers.map((t: any) => t.capital)).toEqual(["100.00", "200.00"])
  })

  test("validation: different plans, plans that exist", async () => {
    const { from } = await setup()
    expect((await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: from.id, transferDate: day(-1), kind: "transfer" })).status).toBe(400)
    expect((await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: NIL, transferDate: day(-1), kind: "transfer" })).status).toBe(404)
    expect((await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: from.id, transferDate: day(-1), kind: "swap" })).status).toBe(400)
  })

  test("deleting a transfer, and the plans surviving the other one's deletion", async () => {
    const { from, to } = await setup()
    await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: to.id, transferDate: day(-5), kind: "transfer" })
    const t = (await plan(to.id)).transfers[0]
    expect((await del(`/pensions/transfers/${t.id}`)).status).toBe(204)
    expect((await del(`/pensions/transfers/${t.id}`)).status).toBe(404)
    expect((await plan(to.id)).transfers).toEqual([])

    await post("/pensions/transfers", { fromPlanId: from.id, toPlanId: to.id, transferDate: day(-4), kind: "transfer" })
    await del(`/pensions/${from.id}`)
    expect((await plan(to.id)).transfers).toEqual([expect.objectContaining({ fromPlanName: null, toPlanName: to.name })])
  })
})

describe("pension sharing", () => {
  test("a transfer needs edit rights on both plans, and names of plans you cannot see stay hidden", async () => {
    const owner = clientAs(user(unique("owner"), [], { isAdmin: false }))
    const group = unique("fam")
    const viewer = clientAs(user(unique("viewer"), [group]))
    const mine = (await owner.post("/pensions", { name: unique("mine"), kind: "personal" })).body
    const secret = (await owner.post("/pensions", { name: unique("secret"), kind: "occupational_db" })).body
    await owner.post(`/pensions/${mine.id}/members`, { groupName: group, role: "editor" })
    await owner.post("/pensions/transfers", { fromPlanId: secret.id, toPlanId: mine.id, transferDate: day(-1), kind: "transfer" })

    // the viewer-editor of `mine` sees the transfer, but not the name of the plan it came from
    const seen = (await viewer.get("/pensions")).body.find((p: any) => p.id === mine.id)
    expect(seen.transfers).toEqual([expect.objectContaining({ fromPlanId: secret.id, fromPlanName: null, toPlanName: mine.name })])
    expect((await viewer.get("/pensions")).body.map((p: any) => p.id)).not.toContain(secret.id)
    // and cannot move value out of a plan they cannot edit
    const other = (await viewer.post("/pensions", { name: unique("own"), kind: "personal" })).body
    expect((await viewer.post("/pensions/transfers", { fromPlanId: secret.id, toPlanId: other.id, transferDate: day(-1), kind: "transfer" })).status).toBe(404)
  })
})
