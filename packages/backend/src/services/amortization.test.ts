import { describe, expect, test } from "bun:test"
import { computePartState, type PartInput } from "./amortization"

const part = (over: Partial<PartInput> = {}): PartInput => ({
  type: "annuity",
  principal: "120000",
  annualInterestRate: "0.06",
  startDate: "2020-01-01",
  endDate: "2030-01-01", // 120 months
  ...over,
})

// Local-time dates, matching the service's parseDate
const at = (y: number, m: number, d = 15) => new Date(y, m - 1, d)

describe("computePartState — structure", () => {
  test("total/elapsed/remaining months", () => {
    const s = computePartState(part(), [], at(2022, 1))
    expect(s.totalMonths).toBe(120)
    expect(s.monthsElapsed).toBe(24)
    expect(s.monthsRemaining).toBe(96)
  })

  test("before start → nothing elapsed, full balance", () => {
    const s = computePartState(part(), [], at(2019, 6))
    expect(s.monthsElapsed).toBe(0)
    expect(s.currentBalance).toBe(120000)
  })

  test("after end → capped at totalMonths", () => {
    const s = computePartState(part(), [], at(2035, 1))
    expect(s.monthsElapsed).toBe(120)
    expect(s.monthsRemaining).toBe(0)
  })
})

describe("annuity", () => {
  test("standard payment formula", () => {
    const s = computePartState(part(), [], at(2020, 1))
    // 120k @ 6%/yr over 120 months ≈ 1332.25
    expect(s.originalMonthlyPayment).toBeCloseTo(1332.25, 1)
  })

  test("balance declines monotonically and is ~0 at the end", () => {
    let prev = Infinity
    for (let y = 2020; y <= 2029; y++) {
      const b = computePartState(part(), [], at(y, 1)).currentBalance
      expect(b).toBeLessThanOrEqual(prev)
      prev = b
    }
    expect(computePartState(part(), [], at(2030, 1)).currentBalance).toBeLessThan(50)
  })

  test("zero interest divides principal evenly", () => {
    const s = computePartState(part({ annualInterestRate: "0" }), [], at(2020, 1))
    expect(s.originalMonthlyPayment).toBe(1000)
  })
})

describe("linear", () => {
  test("constant principal, interest shrinks", () => {
    const p = part({ type: "linear", annualInterestRate: "0.06" })
    const s = computePartState(p, [], at(2022, 1)) // 24 months in
    expect(s.originalMonthlyPayment).toBe(1000)
    expect(s.currentBalance).toBe(96000)
    expect(s.monthlyPrincipal).toBe(1000)
    expect(s.monthlyInterest).toBe(480) // 96000 * 0.005
    expect(s.monthlyPayment).toBe(1480)
  })
})

describe("interest_only", () => {
  test("balance never moves", () => {
    const s = computePartState(part({ type: "interest_only" }), [], at(2025, 1))
    expect(s.currentBalance).toBe(120000)
    expect(s.monthlyPrincipal).toBe(0)
    expect(s.monthlyInterest).toBe(600)
  })
})

describe("extra payments", () => {
  test("reduce the balance by the amount for linear/interest_only", () => {
    const extra = [{ paymentDate: "2021-03-10", amount: "10000" }]
    const lin = computePartState(part({ type: "linear" }), extra, at(2022, 1))
    expect(lin.currentBalance).toBe(86000) // 96000 - 10000
    const io = computePartState(part({ type: "interest_only" }), extra, at(2022, 1))
    expect(io.currentBalance).toBe(110000)
  })

  test("annuity with extra payment ends below the no-extra balance", () => {
    const base = computePartState(part(), [], at(2025, 1)).currentBalance
    const withExtra = computePartState(part(), [{ paymentDate: "2021-03-10", amount: "10000" }], at(2025, 1)).currentBalance
    expect(withExtra).toBeLessThan(base - 10000)
  })

  test("extra payments in the current month are applied", () => {
    const s = computePartState(part({ type: "interest_only" }), [{ paymentDate: "2022-01-05", amount: "5000" }], at(2022, 1))
    expect(s.currentBalance).toBe(115000)
  })

  test("extra payments larger than the balance clamp to zero", () => {
    const s = computePartState(part({ type: "interest_only" }), [{ paymentDate: "2021-01-05", amount: "999999" }], at(2022, 1))
    expect(s.currentBalance).toBe(0)
    expect(s.monthlyPayment).toBe(0)
  })

  test("multiple extras in the same month are summed", () => {
    const extras = [{ paymentDate: "2021-03-01", amount: "1000" }, { paymentDate: "2021-03-20", amount: "2000" }]
    const s = computePartState(part({ type: "interest_only" }), extras, at(2022, 1))
    expect(s.currentBalance).toBe(117000)
  })
})
