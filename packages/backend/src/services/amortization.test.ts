import { describe, expect, test } from "bun:test"
import { computePartState, monthlyRate, type PartInput } from "./amortization"

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

describe("rate type: nominal vs effective", () => {
  test("monthlyRate: nominal is rate/12, effective compounds to the annual rate; nominal is the default", () => {
    expect(monthlyRate(0.06)).toBeCloseTo(0.005, 10)
    expect(monthlyRate(0.06, "nominal")).toBeCloseTo(0.005, 10)
    expect(Math.pow(1 + monthlyRate(0.059, "effective"), 12) - 1).toBeCloseTo(0.059, 10)
    expect(monthlyRate(0, "effective")).toBe(0)
  })

  test("a part without a rateType behaves exactly as before (nominal)", () => {
    expect(computePartState(part(), [], at(2022, 1))).toEqual(computePartState(part({ rateType: "nominal" }), [], at(2022, 1)))
  })

  test("the same quoted rate is cheaper as effective than as nominal", () => {
    const nominal = computePartState(part(), [], at(2020, 1)).originalMonthlyPayment
    const effective = computePartState(part({ rateType: "effective" }), [], at(2020, 1)).originalMonthlyPayment
    expect(effective).toBeLessThan(nominal)
  })

  test("a loan: 28500 over 37 months at 5.9% effective is a payment of 842.36, fully repaid at the end", () => {
    const loan = part({ principal: "28500", annualInterestRate: "0.059", rateType: "effective", startDate: "2024-11-28", endDate: "2027-12-28" })
    const first = computePartState(loan, [], at(2024, 12, 29))
    expect(first.totalMonths).toBe(37)
    expect(first.originalMonthlyPayment).toBe(842.36)
    expect(first.currentBalance).toBeCloseTo(27794.1, 0) // after the first installment
    expect(computePartState(loan, [], at(2027, 12, 29)).currentBalance).toBeLessThan(0.1)
    // the same quote taken as nominal would be too expensive
    expect(computePartState({ ...loan, rateType: "nominal" }, [], at(2024, 12, 29)).originalMonthlyPayment).toBe(844.34)
  })

  test("applies to linear and interest-only parts too", () => {
    const io = computePartState(part({ type: "interest_only", principal: "100000", annualInterestRate: "0.12", rateType: "effective" }), [], at(2020, 6))
    expect(io.monthlyInterest).toBeCloseTo(100000 * (Math.pow(1.12, 1 / 12) - 1), 0)
  })
})
