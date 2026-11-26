import { describe, expect, test } from "vitest"
import { debt, part } from "../../../test/fixtures"
import { repaidSoFar } from "./repaid"

const TODAY = "2026-11-26"

describe("repaidSoFar", () => {
  test("what was borrowed minus what is left, of which what came from extra payments", () => {
    const d = debt({
      parts: [part({ principal: "200000.00", capitalizedInterest: 50, extraPayments: [{ id: "e1", partId: "part-1", paymentDate: "2024-01-01", amount: "5000.00", notes: null, createdAt: "" }, { id: "e2", partId: "part-1", paymentDate: "2030-01-01", amount: "999.00", notes: null, createdAt: "" }] })],
      totalCurrentBalance: 150050,
    })
    const r = repaidSoFar(d, TODAY)!
    expect(r).toMatchObject({ original: 200050, left: 150050, repaid: 50000, extra: 5000 }) // the 2030 one is not paid yet
    expect(r.percent).toBeCloseTo(24.99, 1)
  })

  test("a part that continues another one is not borrowed again", () => {
    const d = debt({
      parts: [part({ id: "a", principal: "100000", closedOn: "2024-01-01" }), part({ id: "b", principal: "70000", continuesPartId: "a" })],
      totalCurrentBalance: 65000,
    })
    expect(repaidSoFar(d, TODAY)).toMatchObject({ original: 100000, left: 65000, repaid: 35000 })
  })

  test("nothing yet repaid, and nothing to measure without parts", () => {
    expect(repaidSoFar(debt({ parts: [part({ principal: "1000" })], totalCurrentBalance: 1000 }), TODAY)).toMatchObject({ repaid: 0, percent: 0 })
    expect(repaidSoFar(debt({ parts: [], totalCurrentBalance: 0 }), TODAY)).toBeNull()
  })
})
