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

// Instants at noon UTC: the same calendar date in every time zone (the service works on UTC dates)
const utc = (y: number, monthIndex: number, d: number) => new Date(Date.UTC(y, monthIndex, d, 12))
const at = (y: number, m: number, d = 15) => utc(y, m - 1, d)

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

describe("payment dates (day of the month)", () => {
  const loan = part({ principal: "28500", annualInterestRate: "0.059", rateType: "effective", startDate: "2024-11-28", endDate: "2027-12-28" })

  test("a payment counts once its date has passed, not from the first of the month", () => {
    expect(computePartState(loan, [], utc(2026, 9, 27)).monthsElapsed).toBe(22) // 27 Oct: the 28 Oct payment is still to come
    expect(computePartState(loan, [], utc(2026, 9, 28)).monthsElapsed).toBe(23)
    expect(computePartState(loan, [], utc(2026, 10, 18)).monthsElapsed).toBe(23)
    expect(computePartState(loan, [], utc(2026, 10, 28)).monthsElapsed).toBe(24)
  })

  test("a part that starts on the 31st pays on the last day of shorter months", () => {
    const p = part({ startDate: "2024-01-31", endDate: "2025-01-31" })
    expect(computePartState(p, [], utc(2024, 1, 28)).monthsElapsed).toBe(0) // 28 Feb 2024 is not the end of Feb (leap year)
    expect(computePartState(p, [], utc(2024, 1, 29)).monthsElapsed).toBe(1)
  })

  test("parts that start on the 1st behave as before", () => {
    expect(computePartState(part(), [], at(2022, 1, 1)).monthsElapsed).toBe(24)
    expect(computePartState(part(), [], at(2021, 12, 31)).monthsElapsed).toBe(23)
  })
})

describe("extra payments: timing and a shorter term", () => {
  const loan = part({ principal: "28500", annualInterestRate: "0.059", rateType: "effective", startDate: "2024-11-28", endDate: "2027-12-28" })
  const extra = [{ paymentDate: "2026-05-24", amount: "1000" }]
  const now = utc(2026, 10, 18)

  test("a loan with an extra payment: balance close to the reference 10355.2, payment unchanged", () => {
    const s = computePartState(loan, extra, now)
    expect(s.monthsElapsed).toBe(23)
    expect(s.currentBalance).toBeCloseTo(10355.22, 2)
    expect(Math.abs(s.currentBalance - 10355.2)).toBeLessThan(0.5)
    expect(s.originalMonthlyPayment).toBe(842.36)
    expect(s.monthlyPayment).toBe(842.36)
  })

  test("the extra payment shortens the term: the payment stays, the loan ends a month earlier", () => {
    const without = computePartState(loan, [], now)
    const withExtra = computePartState(loan, extra, now)
    expect(without.monthsRemaining).toBe(14)
    expect(without.projectedEndDate).toBe("2027-12-28")
    expect(withExtra.monthsRemaining).toBe(13)
    expect(withExtra.projectedEndDate).toBe("2027-11-28")
    expect(withExtra.totalMonths).toBe(37) // the schedule itself is unchanged
  })

  test("an extra payment just before a payment date saves only the days left in that period", () => {
    const before = (day: number) => computePartState(loan, [{ paymentDate: `2026-05-${day}`, amount: "1000" }], now).currentBalance
    expect(before(1)).toBeLessThan(before(24)) // earlier in the period = more interest saved
    expect(before(24)).toBeLessThan(before(28)) // on the payment date itself: no saving in that period
    // all of them are within a month's interest (4.79 on 1000) of each other
    expect(before(28) - before(1)).toBeLessThan(5.6)
    expect(before(28) - before(1)).toBeGreaterThan(4)
  })

  test("an annuity repaid early reports a zero balance and no payments left", () => {
    const s = computePartState(loan, [{ paymentDate: "2026-05-24", amount: "20000" }, { paymentDate: "2026-06-01", amount: "20000" }], now)
    expect(s.currentBalance).toBe(0)
    expect(s.monthsRemaining).toBe(0)
  })

  test("linear: the principal portion stays and the term shortens", () => {
    const lin = part({ type: "linear", principal: "12000", annualInterestRate: "0.06", startDate: "2024-01-01", endDate: "2025-01-01" }) // 12 x 1000
    const s = computePartState(lin, [{ paymentDate: "2024-03-10", amount: "3000" }], utc(2024, 3, 15))
    expect(s.monthsElapsed).toBe(3)
    expect(s.monthlyPrincipal).toBe(1000)
    expect(s.currentBalance).toBe(6000) // 12000 - 3 payments of 1000 - the extra 3000
    expect(s.monthsRemaining).toBe(6) // scheduled: 9 left; the extra 3000 takes 3 payments off
    expect(s.projectedEndDate).toBe("2024-10-01")
  })

  test("interest-only: extra payments lower the interest but do not shorten the term", () => {
    const io = part({ type: "interest_only", principal: "100000", annualInterestRate: "0.12" })
    const s = computePartState(io, [{ paymentDate: "2021-03-10", amount: "10000" }], at(2022, 1))
    expect(s.monthsRemaining).toBe(96)
    expect(s.monthlyInterest).toBe(900)
  })
})

describe("a payout before the first installment (interest of the partial month is added to the loan)", () => {
  // 250,000 at 3.15%, paid out 9 Oct 2018, installments on the 1st from 1 Dec 2018, 360 of them (the last on 1 Nov 2048)
  const mortgage = { type: "annuity", principal: "250000", annualInterestRate: "0.0315", startDate: "2018-10-09", endDate: "2048-11-01", firstPaymentDate: "2018-12-01" }
  const today = utc(2026, 10, 19)

  test("matches a mortgage: payment 1076.43 and a balance within a few euros of the reference 204,819.22", () => {
    const s = computePartState(mortgage, [], today)
    expect(s.originalMonthlyPayment).toBe(1076.43) // without the partial month it would be 1074.34
    expect(s.totalMonths).toBe(360)
    expect(s.monthsElapsed).toBe(96)
    expect(Math.abs(s.currentBalance - 204819.22)).toBeLessThan(3)
    expect(s.projectedEndDate).toBe("2048-11-01")
  })

  test("without a first payment date nothing changes", () => {
    const plain = computePartState({ ...mortgage, startDate: "2018-11-01", firstPaymentDate: null }, [], today)
    expect(plain.originalMonthlyPayment).toBe(1074.34)
    expect(plain.monthsElapsed).toBe(96)
  })

  test("a first payment exactly one month after the start has no partial month", () => {
    const same = computePartState({ ...mortgage, startDate: "2018-11-01" }, [], today)
    expect(same.originalMonthlyPayment).toBe(1074.34)
  })

  test("the first installment counts once its date has passed, not before", () => {
    expect(computePartState(mortgage, [], utc(2018, 10, 30)).monthsElapsed).toBe(0)
    expect(computePartState(mortgage, [], utc(2018, 11, 1)).monthsElapsed).toBe(1)
  })

  test("interest-only parts ignore the partial month (they pay the interest, nothing is added)", () => {
    const s = computePartState({ ...mortgage, type: "interest_only" }, [], today)
    expect(s.currentBalance).toBe(250000)
  })
})

describe("rate changes (the end of a fixed-rate period)", () => {
  const linear = { type: "linear", principal: "12000", annualInterestRate: "0.12", startDate: "2024-01-01", endDate: "2025-01-01" } satisfies PartInput
  const toSixPercent = [{ effectiveDate: "2024-07-01", annualInterestRate: "0.06" }]

  test("before the change nothing differs, and the next change is announced", () => {
    const s = computePartState(linear, [], utc(2024, 5, 15), toSixPercent) // 15 June: 5 payments made
    expect(s.monthsElapsed).toBe(5)
    expect(s.currentBalance).toBe(7000)
    expect(s.monthlyInterest).toBe(70) // 7000 × 1%
    expect(s.monthlyPayment).toBe(1070)
    expect(s.currentRate).toEqual({ annualInterestRate: "0.12", rateType: "nominal" })
    expect(s.nextRateChange).toMatchObject({ effectiveDate: "2024-07-01", annualInterestRate: "0.06" })
  })

  test("from the change on, interest is charged at the new rate; a linear part keeps its principal portion", () => {
    const s = computePartState(linear, [], utc(2024, 6, 15), toSixPercent) // 15 July: 6 payments made, the 7th period starts 1 July
    expect(s.monthsElapsed).toBe(6)
    expect(s.currentBalance).toBe(6000)
    expect(s.monthlyInterest).toBe(30) // 6000 × 0.5%
    expect(s.monthlyPrincipal).toBe(1000)
    expect(s.monthlyPayment).toBe(1030)
    expect(s.currentRate.annualInterestRate).toBe("0.06")
    expect(s.nextRateChange).toBeNull()
  })

  test("a change whose date falls inside a period applies from the next period", () => {
    const midPeriod = [{ effectiveDate: "2024-06-20", annualInterestRate: "0.06" }]
    expect(computePartState(linear, [], utc(2024, 5, 15), midPeriod).monthlyInterest).toBe(70) // the period starting 1 June: 7000 × 1%
    expect(computePartState(linear, [], utc(2024, 6, 15), midPeriod).monthlyInterest).toBe(30) // the one starting 1 July: 6000 × 0.5%
  })

  test("an interest-only part just pays the new interest", () => {
    const only = { ...linear, type: "interest_only" }
    expect(computePartState(only, [], utc(2024, 5, 15), toSixPercent).monthlyPayment).toBe(120) // 12000 × 1%
    expect(computePartState(only, [], utc(2024, 6, 15), toSixPercent).monthlyPayment).toBe(60) // 12000 × 0.5%
  })

  describe("annuity", () => {
    const annuity = { type: "annuity", principal: "100000", annualInterestRate: "0.024", startDate: "2020-01-01", endDate: "2030-01-01" } satisfies PartInput
    const sixPercent = [{ effectiveDate: "2025-01-01", annualInterestRate: "0.06" }]
    // the installment of `balance` over `months` months at a monthly rate
    const pmt = (balance: number, r: number, months: number) => (balance * r) / (1 - Math.pow(1 + r, -months))

    test("the installment is recalculated at the change: from the balance, the new rate and the months left in the contract", () => {
      const without = computePartState(annuity, [], utc(2025, 0, 15))
      const s = computePartState(annuity, [], utc(2025, 0, 15), sixPercent) // 60 of 120 payments made
      expect(s.monthsElapsed).toBe(60)
      expect(s.currentBalance).toBe(without.currentBalance) // the new rate has not charged anything yet
      expect(s.originalMonthlyPayment).toBe(without.originalMonthlyPayment) // what was scheduled at the start
      expect(s.monthlyPayment).toBeCloseTo(pmt(s.currentBalance, 0.005, 60), 1)
      expect(s.monthlyPayment).toBeGreaterThan(without.monthlyPayment + 50) // a clearly higher payment
      expect(s.monthlyInterest).toBeCloseTo(s.currentBalance * 0.005, 1)
      expect(s.monthsRemaining).toBe(60) // still ends with the contract
      expect(s.projectedEndDate).toBe("2030-01-01")
    })

    test("the balance afterwards follows the new rate (checked against an independent month-by-month run)", () => {
      const s = computePartState(annuity, [], utc(2026, 0, 15), sixPercent) // 72 payments made: 12 after the change
      let b = computePartState(annuity, [], utc(2025, 0, 15)).currentBalance
      const installment = Math.round(pmt(b, 0.005, 60) * 100) / 100
      for (let i = 0; i < 12; i++) b = Math.round((b - (installment - Math.round(b * 0.005 * 100) / 100)) * 100) / 100
      expect(s.monthsElapsed).toBe(72)
      expect(s.currentBalance).toBeCloseTo(b, 1)
    })

    test("a rate that is the same as before changes nothing, and a lower one lowers the payment", () => {
      const same = computePartState(annuity, [], utc(2025, 0, 15), [{ effectiveDate: "2025-01-01", annualInterestRate: "0.024" }])
      const plain = computePartState(annuity, [], utc(2025, 0, 15))
      expect(same.monthlyPayment).toBeCloseTo(plain.monthlyPayment, 1)
      const lower = computePartState(annuity, [], utc(2025, 0, 15), [{ effectiveDate: "2025-01-01", annualInterestRate: "0.01" }])
      expect(lower.monthlyPayment).toBeLessThan(plain.monthlyPayment)
    })

    test("a future change shows in the projection but not in today's numbers", () => {
      const plain = computePartState(annuity, [], utc(2022, 5, 15))
      const s = computePartState(annuity, [], utc(2022, 5, 15), sixPercent)
      expect(s.currentBalance).toBe(plain.currentBalance)
      expect(s.monthlyPayment).toBe(plain.monthlyPayment)
      expect(s.nextRateChange?.effectiveDate).toBe("2025-01-01")
    })

    test("the rate type is per period (a bank quotes the new rate as effective)", () => {
      const eff = computePartState(annuity, [], utc(2025, 0, 15), [{ effectiveDate: "2025-01-01", annualInterestRate: "0.06", rateType: "effective" }])
      const nom = computePartState(annuity, [], utc(2025, 0, 15), sixPercent)
      expect(eff.currentRate.rateType).toBe("effective")
      expect(eff.monthlyInterest).toBeLessThan(nom.monthlyInterest) // 6% effective is 0.487%/month, nominal is 0.5%
    })

    test("changes are applied in date order, whatever the order they are given in", () => {
      const a = computePartState(annuity, [], utc(2027, 0, 15), [{ effectiveDate: "2026-01-01", annualInterestRate: "0.03" }, ...sixPercent])
      const b = computePartState(annuity, [], utc(2027, 0, 15), [...sixPercent, { effectiveDate: "2026-01-01", annualInterestRate: "0.03" }])
      expect(a).toEqual(b)
      expect(a.currentRate.annualInterestRate).toBe("0.03")
    })

    test("together with extra payments: the payment is recalculated over the contract months left", () => {
      const s = computePartState(annuity, [{ paymentDate: "2024-06-10", amount: "10000" }], utc(2025, 0, 15), sixPercent)
      const plain = computePartState(annuity, [], utc(2025, 0, 15), sixPercent)
      expect(s.currentBalance).toBeLessThan(plain.currentBalance - 10000) // the extra payment also saved interest
      expect(s.monthlyPayment).toBeCloseTo(pmt(s.currentBalance, 0.005, 60), 1)
      expect(s.monthlyPayment).toBeLessThan(plain.monthlyPayment)
    })
  })
})
