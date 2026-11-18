import { describe, expect, test } from "bun:test"
import { del, get, patch, post, unique } from "../../test/helpers"

const NIL = "00000000-0000-0000-0000-000000000000"

// Mortgages and loans share one implementation shape, so one suite covers both.
for (const kind of ["mortgages", "loans"] as const) {
  describe(`${kind}`, () => {
    const base = `/${kind}`
    const create = (body: object = {}) => post(base, { name: unique(kind), ...body })
    /** There is no GET /:id — the list endpoint is the read model. */
    const detail = async (id: string) => (await get(base)).body.find((d: any) => d.id === id)
    const part = (over: object = {}) => ({
      name: "Part 1", type: "annuity", principal: "120000", annualInterestRate: "0.06",
      startDate: "2020-01-01", endDate: "2030-01-01", ...over,
    })

    test("create / list / rename / delete", async () => {
      const r = await create({ name: `  ${unique("d")} `, currency: "USD" })
      expect(r.status).toBe(201)
      expect(r.body.currency).toBe("USD")
      expect(r.body.name).toBe(r.body.name.trim())

      const listed = (await get(base)).body.find((d: any) => d.id === r.body.id)
      expect(listed).toMatchObject({ isOwner: true, canEdit: true })
      expect(listed.parts).toEqual([])

      const renamed = await patch(`${base}/${r.body.id}`, { name: "Renamed", currency: "EUR" })
      expect(renamed.body).toMatchObject({ name: "Renamed", currency: "EUR" })

      expect((await del(`${base}/${r.body.id}`)).status).toBe(204)
      expect((await patch(`${base}/${r.body.id}`, { name: "gone" })).status).toBe(404)
    })

    test("create/update validation", async () => {
      expect((await post(base, { name: " " })).status).toBe(400)
      expect((await post(base, { name: "x", currency: "GBP" })).status).toBe(400)
      const d = (await create()).body
      expect((await patch(`${base}/${d.id}`, {})).status).toBe(400) // nothing to update
      expect((await patch(`${base}/${d.id}`, { currency: "CHF" })).status).toBe(400)
      expect((await patch(`${base}/${NIL}`, { name: "x" })).status).toBe(404)
    })

    test("adding a part computes the amortization state", async () => {
      const d = (await create()).body
      const r = await post(`${base}/${d.id}/parts`, part({ startDate: "2020-01-01", endDate: "2030-01-01" }))
      expect(r.status).toBe(201)
      expect(r.body).toMatchObject({ name: "Part 1", type: "annuity" })
      expect(r.body.totalMonths).toBe(120)
      expect(r.body.originalMonthlyPayment).toBeCloseTo(1332.25, 1)
      expect(r.body.extraPayments).toEqual([])
      expect(parseFloat(r.body.principal)).toBe(120000)

      const listed = await detail(d.id)
      expect(listed.parts).toHaveLength(1)
      expect(listed.totalCurrentBalance).toBe(listed.parts[0].currentBalance)
      expect(listed.totalMonthlyPayment).toBe(listed.parts[0].monthlyPayment)
    })

    test("the rate type defaults to nominal, can be set to effective on creation, and changed on update", async () => {
      const d = (await create()).body
      const nominal = (await post(`${base}/${d.id}/parts`, part())).body
      expect(nominal.rateType).toBe("nominal")

      const eff = (await post(`${base}/${d.id}/parts`, part({ principal: "28500", annualInterestRate: "0.059", rateType: "effective", startDate: "2024-11-28", endDate: "2027-12-28" }))).body
      expect(eff.rateType).toBe("effective")
      expect(eff.totalMonths).toBe(37)
      expect(eff.originalMonthlyPayment).toBe(842.36)

      const flipped = await patch(`${base}/${d.id}/parts/${eff.id}`, { rateType: "nominal" })
      expect(flipped.status).toBe(200)
      expect(flipped.body.rateType).toBe("nominal")
      expect(flipped.body.originalMonthlyPayment).toBe(844.34)
      expect((await detail(d.id)).parts.find((p: any) => p.id === eff.id).rateType).toBe("nominal")
    })

    test("an unknown rate type is rejected", async () => {
      const d = (await create()).body
      expect((await post(`${base}/${d.id}/parts`, part({ rateType: "weekly" }))).status).toBe(400)
      const p = (await post(`${base}/${d.id}/parts`, part())).body
      expect((await patch(`${base}/${d.id}/parts/${p.id}`, { rateType: "weekly" })).status).toBe(400)
    })

    test("totals add up over several parts", async () => {
      const d = (await create()).body
      await post(`${base}/${d.id}/parts`, part({ type: "interest_only", principal: "100000", annualInterestRate: "0.12", startDate: "2020-01-01", endDate: "2050-01-01" }))
      await post(`${base}/${d.id}/parts`, part({ type: "interest_only", principal: "50000", annualInterestRate: "0.12", startDate: "2020-01-01", endDate: "2050-01-01" }))
      const listed = await detail(d.id)
      expect(listed.parts).toHaveLength(2)
      expect(listed.totalCurrentBalance).toBe(150000)
      expect(listed.totalMonthlyPayment).toBe(1500) // 1% a month on 150k
    })

    test("a part can be deleted", async () => {
      const d = (await create()).body
      const p = (await post(`${base}/${d.id}/parts`, part())).body
      expect((await del(`${base}/${d.id}/parts/${p.id}`)).status).toBe(204)
      expect((await detail(d.id)).parts).toEqual([])
    })

    test("part validation", async () => {
      const d = (await create()).body
      const url = `${base}/${d.id}/parts`
      expect((await post(url, part({ name: " " }))).status).toBe(400)
      expect((await post(url, part({ type: "balloon" }))).body.error).toContain("type must be linear, annuity, or interest_only")
      expect((await post(url, part({ principal: "0" }))).status).toBe(400)
      expect((await post(url, part({ principal: "lots" }))).status).toBe(400)
      expect((await post(url, part({ annualInterestRate: "-0.01" }))).status).toBe(400)
      expect((await post(url, part({ startDate: "2020-02-30" }))).status).toBe(400)
      const order = await post(url, part({ startDate: "2030-01-01", endDate: "2020-01-01" }))
      expect(order.status).toBe(400)
      expect(order.body.error).toContain("endDate must be after startDate")
      expect((await post(`${base}/${NIL}/parts`, part())).status).toBe(404)
    })

    test("update a part (rate, end date, name); empty update is rejected", async () => {
      const d = (await create()).body
      const p = (await post(`${base}/${d.id}/parts`, part())).body
      const r = await patch(`${base}/${d.id}/parts/${p.id}`, { name: "Renamed", annualInterestRate: "0.03", endDate: "2035-01-01" })
      expect(r.status).toBe(200)
      expect(r.body.name).toBe("Renamed")
      expect(parseFloat(r.body.annualInterestRate)).toBeCloseTo(0.03)
      expect(r.body.endDate).toBe("2035-01-01")
      expect((await patch(`${base}/${d.id}/parts/${p.id}`, {})).status).toBe(400)
      expect((await patch(`${base}/${d.id}/parts/${p.id}`, { annualInterestRate: "x" })).status).toBe(400)
    })

    test("extra payments lower the balance and can be deleted", async () => {
      const d = (await create()).body
      const p = (await post(`${base}/${d.id}/parts`, part({ type: "interest_only", startDate: "2020-01-01", endDate: "2040-01-01" }))).body
      expect((await detail(d.id)).parts[0].currentBalance).toBe(120000)

      const pay = await post(`${base}/${d.id}/parts/${p.id}/payments`, { paymentDate: "2021-06-15", amount: "20000", notes: "bonus" })
      expect(pay.status).toBe(201)
      expect(pay.body).toMatchObject({ notes: "bonus" })

      const after = (await detail(d.id)).parts[0]
      expect(after.currentBalance).toBe(100000)
      expect(after.extraPayments).toHaveLength(1)

      const delRes = await del(`${base}/${d.id}/parts/${p.id}/payments/${pay.body.id}`)
      expect(delRes.status).toBe(204)
      expect((await detail(d.id)).parts[0].currentBalance).toBe(120000)
    })

    test("extra payment validation", async () => {
      const d = (await create()).body
      const p = (await post(`${base}/${d.id}/parts`, part())).body
      const url = `${base}/${d.id}/parts/${p.id}/payments`
      expect((await post(url, { paymentDate: "2021-06-15", amount: "0" })).status).toBe(400)
      expect((await post(url, { paymentDate: "2021-06-15", amount: "-5" })).status).toBe(400)
      expect((await post(url, { paymentDate: "someday", amount: "5" })).status).toBe(400)
      expect((await post(url, { amount: "5" })).status).toBe(400)
    })

    test("deleting a mortgage/loan cascades to its parts", async () => {
      const d = (await create()).body
      await post(`${base}/${d.id}/parts`, part())
      expect((await del(`${base}/${d.id}`)).status).toBe(204)
      expect(await detail(d.id)).toBeUndefined()
    })

    test("members: add, upsert and remove", async () => {
      const d = (await create()).body
      expect((await post(`${base}/${d.id}/members`, { groupName: " fam " })).body).toEqual({ groupName: "fam", role: "viewer" })
      expect((await post(`${base}/${d.id}/members`, { groupName: "fam", role: "editor" })).body.role).toBe("editor")
      const listed = (await get(base)).body.find((x: any) => x.id === d.id)
      expect(listed.members).toEqual([{ groupName: "fam", role: "editor" }])
      expect((await del(`${base}/${d.id}/members/fam`)).status).toBe(204)
      expect((await post(`${base}/${d.id}/members`, { groupName: "" })).status).toBe(400)
      expect((await post(`${base}/${d.id}/members`, { groupName: "g", role: "boss" })).status).toBe(400)
      expect((await post(`${base}/${NIL}/members`, { groupName: "g" })).status).toBe(404)
    })
  })
}
