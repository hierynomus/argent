import { addMonths, daysBetween, monthsBetween, todayIso } from "../lib/dates"
import { cents } from "./money"

export interface ExtraPayment {
  paymentDate: string  // ISO date "YYYY-MM-DD"
  amount: string
}

export interface PartInput {
  type: string  // "linear" | "annuity" | "interest_only"
  principal: string
  annualInterestRate: string
  /** "nominal" (default): monthly rate = rate/12. "effective": monthly rate = (1+rate)^(1/12) - 1. */
  rateType?: string
  /** the day the money was paid out (interest starts here) */
  startDate: string  // ISO date
  endDate: string    // ISO date
  /**
   * The date of the first installment, when it is more than a month after `startDate` (a loan paid out
   * mid-month with installments on the 1st). The interest of that partial period is added to the loan.
   * Default: one month after `startDate`.
   */
  firstPaymentDate?: string | null
  /** at a rate change an annuity is recalculated over the months left in the "contract" (default) or the "remaining" term (shortened by extra payments) */
  resetRecalculation?: string | null
  /** the day the part stops being a liability: its balance on that day is continued in other parts and/or repaid */
  closedOn?: string | null
}

export interface PartState {
  currentBalance: number
  monthlyPayment: number
  monthlyInterest: number
  monthlyPrincipal: number
  originalMonthlyPayment: number
  /** number of scheduled payments (start → end), not counting the effect of extra payments */
  totalMonths: number
  /** scheduled payments whose date has passed */
  monthsElapsed: number
  /** payments still to make at the current payment size; extra payments shorten this */
  monthsRemaining: number
  /** date of the last payment given the current balance (earlier than `endDate` after extra payments), ISO */
  projectedEndDate: string
  /** interest of a partial first month that was added to the loan (see `firstPaymentDate`) */
  capitalizedInterest: number
  /** the rate the next installment is calculated with */
  currentRate: { annualInterestRate: string; rateType: string }
  /** the first rate change after the current period (the end of the fixed-rate period), if one is known */
  nextRateChange: RateChange | null
  /** the day the part was (or will be) closed, if it was */
  closedOn: string | null
  /** what was left of the part on the day it was (or will be) closed: continued in other parts and/or repaid */
  carriedOver: number | null
}

/** From `effectiveDate` on, the part runs at this rate (the end of a fixed-rate period). The part's own rate is the first one. */
export interface RateChange {
  effectiveDate: string // ISO date
  annualInterestRate: string
  rateType?: string
}

// Dates are `YYYY-MM-DD` strings handled by lib/dates.ts (time-zone independent); "today" is the UTC date.
// Payment m is due `m` months after the start, on the start's day of the month (clamped to short months).

/** The monthly interest rate for an annual rate, depending on how it is quoted. */
export function monthlyRate(annualRate: number, rateType: string = "nominal"): number {
  return rateType === "effective" ? Math.pow(1 + annualRate, 1 / 12) - 1 : annualRate / 12
}


/** The level installment of an annuity of `balance` over `months` months at monthly rate `r`, in cents. */
const annuityPayment = (balance: number, r: number, months: number): number =>
  cents(r === 0 ? balance / months : (balance * r) / (1 - Math.pow(1 + r, -months)))

/** How many installments of `installment` repay `balance` at monthly rate `r` (at most `cap`). */
function monthsToRepay(balance: number, r: number, installment: number, cap: number): number {
  let b = balance
  let n = 0
  while (b > 0 && n < cap) {
    const principalPaid = installment - cents(b * r)
    if (principalPaid <= 0) return cap // the installment does not even cover the interest
    b = cents(b - Math.min(b, principalPaid))
    n++
  }
  return Math.max(1, n)
}

/**
 * Compute the current amortization state for a mortgage/loan part.
 *
 * Payment m is due on the start date's day of the month, m months after the start (so a part that
 * starts on the 28th has its first payment on the 28th of the next month). `monthsElapsed` counts the
 * payments whose date has passed. The simulation walks the payments one by one:
 *
 *  - Interest of a period is the opening balance times the monthly rate (see `monthlyRate`).
 *  - The rate of a period is the latest rate whose `effectiveDate` is on or before the day the period starts
 *    (`rateChanges` are the ends of fixed-rate periods; the part's own rate is the first). At a change an
 *    annuity's installment is recalculated from the balance, the new rate and the months left in the contract,
 *    as the banks do; a linear part keeps its fixed principal portion, an interest-only part just pays the new interest.
 *  - An extra payment takes effect on its own date. It lowers the balance at once, and lowers that
 *    period's interest in proportion to the days left until the payment date.
 *  - With a `firstPaymentDate` later than one month after the start, the interest of the partial first period
 *    (start → one month before the first installment, pro rata) is added to the balance and spread over the
 *    term, as banks do when the payout is mid-month. Not applied to interest-only parts (they just pay it).
 *  - The scheduled payment stays the same, so extra payments shorten the term (see `monthsRemaining`).
 */
function simulatePart(
  part: PartInput,
  extraPayments: ExtraPayment[],
  asOf: Date,
  rateChanges: RateChange[],
): Omit<PartState, "closedOn" | "carriedOver"> {
  const start = part.startDate
  const end = part.endDate
  const today = todayIso(asOf)

  // the part's own rate, then the later ones in date order
  const rates = [
    { effectiveDate: start, annualInterestRate: part.annualInterestRate, rateType: part.rateType ?? "nominal" },
    ...[...rateChanges].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).map((c) => ({ ...c, rateType: c.rateType ?? "nominal" })),
  ]
  const rateAt = (date: string) => rates.reduce((current, candidate) => (candidate.effectiveDate <= date ? candidate : current), rates[0])
  const monthlyAt = (date: string) => {
    const rate = rateAt(date)
    return monthlyRate(parseFloat(rate.annualInterestRate), rate.rateType)
  }

  // Installment m is due on the first payment date plus m-1 months (default: m months after the start).
  const paymentDate = (m: number) => (part.firstPaymentDate ? addMonths(part.firstPaymentDate, m - 1) : addMonths(start, m))
  // the date the regular months count from, and the interest accrued on the payout before it
  const anchor = part.firstPaymentDate ? addMonths(part.firstPaymentDate, -1) : start
  // period m runs from this date to its installment
  const periodStart = (m: number) => (m === 1 ? anchor : paymentDate(m - 1))
  const r0 = monthlyAt(start)
  const stubInterest =
    part.type !== "interest_only" && anchor > start
      ? cents((parseFloat(part.principal) * r0 * daysBetween(start, anchor)) / Math.max(1, daysBetween(addMonths(anchor, -1), anchor)))
      : 0
  const principal = parseFloat(part.principal) + stubInterest

  const totalMonths = Math.max(1, monthsBetween(anchor, end))
  let monthsElapsed = 0
  while (monthsElapsed < totalMonths && paymentDate(monthsElapsed + 1) <= today) monthsElapsed++

  // The original (unaffected) monthly payment, rounded to cents
  let originalMonthlyPayment: number
  if (part.type === "annuity") {
    originalMonthlyPayment = annuityPayment(principal, r0, totalMonths)
  } else if (part.type === "linear") {
    // For linear, the "original payment" is just the fixed principal portion
    originalMonthlyPayment = cents(principal / totalMonths)
  } else {
    // interest_only
    originalMonthlyPayment = cents(principal * r0)
  }

  // the monthly rate and the annuity installment in force; they change when a new rate period begins
  let r = r0
  let installment = originalMonthlyPayment
  const reprice = (m: number, balance: number) => {
    const next = monthlyAt(periodStart(m))
    if (next === r) return
    const previousRate = r
    r = next
    const contractLeft = totalMonths - (m - 1)
    // by default the new installment is spread over the months left in the contract; some banks use the term
    // that remains after extra payments shortened it
    const monthsLeft = part.resetRecalculation === "remaining" ? monthsToRepay(balance, previousRate, installment, contractLeft) : contractLeft
    if (part.type === "annuity" && balance > 0 && monthsLeft > 0) installment = annuityPayment(balance, r, monthsLeft)
  }

  const extras = extraPayments
    .map((e) => ({ date: e.paymentDate, amount: parseFloat(e.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let ei = 0

  let balance = principal
  // extra payments on/before the start date reduce the principal before any interest accrues
  while (ei < extras.length && extras[ei].date <= start) balance = Math.max(0, cents(balance - extras[ei++].amount))

  // Payment-by-payment simulation — all amounts rounded to cents at each step
  let previous = anchor > start ? anchor : start
  for (let m = 1; m <= monthsElapsed; m++) {
    const due = paymentDate(m)
    const periodDays = Math.max(1, daysBetween(previous, due))
    reprice(m, balance)
    let interest = cents(balance * r)

    // extra payments made during this period (after the previous payment, up to and including this one)
    while (ei < extras.length && extras[ei].date <= due) {
      const amount = Math.min(balance, extras[ei].amount)
      interest = Math.max(0, cents(interest - (amount * r * daysBetween(extras[ei].date, due)) / periodDays))
      balance = cents(balance - amount)
      ei++
    }
    if (balance === 0) break

    if (part.type === "linear") {
      balance = Math.max(0, cents(balance - Math.min(balance, originalMonthlyPayment)))
    } else if (part.type === "annuity") {
      balance = Math.max(0, cents(balance - Math.min(balance, Math.max(0, installment - interest))))
    }
    // interest_only: no principal reduction
    previous = due
  }

  // the period that is under way now: its rate (and an annuity's installment) apply to the next payment
  reprice(monthsElapsed + 1, balance)
  // extra payments made since the last payment (the current, not yet completed period)
  while (ei < extras.length && extras[ei].date <= today) balance = Math.max(0, cents(balance - extras[ei++].amount))

  // Components of the next payment, from the remaining balance
  const currentMonthlyInterest = cents(balance * r)
  let currentMonthlyPrincipal: number
  if (part.type === "linear") {
    currentMonthlyPrincipal = balance > 0 ? Math.min(balance, originalMonthlyPayment) : 0
  } else if (part.type === "annuity") {
    currentMonthlyPrincipal = balance > 0 ? Math.min(balance, Math.max(0, installment - currentMonthlyInterest)) : 0
  } else {
    currentMonthlyPrincipal = 0
  }
  const currentMonthlyPayment = cents(currentMonthlyPrincipal + currentMonthlyInterest)

  // How many payments are still needed at the unchanged payment size? Extra payments only ever shorten
  // this, so it is capped at the scheduled number (which also absorbs a leftover of a few cents).
  const scheduledRemaining = totalMonths - monthsElapsed
  let monthsRemaining = scheduledRemaining
  if (balance <= 0) {
    monthsRemaining = 0
  } else if (part.type === "linear") {
    monthsRemaining = Math.min(scheduledRemaining, Math.ceil(balance / originalMonthlyPayment - 1e-9))
  } else if (part.type === "annuity") {
    // walk the rest of the schedule, through any later rate changes
    let b = balance
    let n = 0
    let rate = r
    let pay = installment
    for (let m = monthsElapsed + 1; b > 0 && m <= totalMonths; m++) {
      const next = monthlyAt(periodStart(m))
      if (next !== rate) {
        const contractLeft = totalMonths - (m - 1)
        const monthsLeft = part.resetRecalculation === "remaining" ? monthsToRepay(b, rate, pay, contractLeft) : contractLeft
        rate = next
        pay = annuityPayment(b, rate, monthsLeft)
      }
      const interest = cents(b * rate)
      const principalPaid = pay - interest
      if (principalPaid <= 0) break
      b = cents(b - Math.min(b, principalPaid))
      n++
    }
    // still not repaid at the end of the schedule (rounding leftovers, or a payment that doesn't cover the interest)
    monthsRemaining = b > 0 ? scheduledRemaining : n
  }

  const current = rateAt(periodStart(monthsElapsed + 1))
  const upcoming = rates.find((x) => x.effectiveDate > periodStart(monthsElapsed + 1))

  return {
    currentBalance: Math.max(0, balance),
    monthlyPayment: currentMonthlyPayment,
    monthlyInterest: currentMonthlyInterest,
    monthlyPrincipal: currentMonthlyPrincipal,
    originalMonthlyPayment,
    totalMonths,
    monthsElapsed,
    monthsRemaining,
    capitalizedInterest: stubInterest,
    projectedEndDate: monthsElapsed + monthsRemaining === 0 ? anchor : paymentDate(monthsElapsed + monthsRemaining),
    currentRate: { annualInterestRate: current.annualInterestRate, rateType: current.rateType },
    nextRateChange: upcoming ? { effectiveDate: upcoming.effectiveDate, annualInterestRate: upcoming.annualInterestRate, rateType: upcoming.rateType } : null,
  }
}

/** The instant a calendar date stands for in `computePartState` (noon UTC, so the same date in every time zone). */
export const instantOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/**
 * The state of a part as of `asOf` (see `simulatePart`), and what became of it when it was closed.
 *
 * A closed part (`closedOn`) is a liability until that day. On the day it is closed what is left of it,
 * `carriedOver`, is continued in other parts and/or repaid; from then on it owes nothing and costs nothing.
 * Before that day it is simulated as usual and `carriedOver` is the balance it is projected to have then.
 */
export function computePartState(
  part: PartInput,
  extraPayments: ExtraPayment[],
  asOf: Date = new Date(),
  rateChanges: RateChange[] = [],
): PartState {
  const closedOn = part.closedOn ?? null
  if (!closedOn) return { ...simulatePart(part, extraPayments, asOf, rateChanges), closedOn: null, carriedOver: null }

  const atClose = simulatePart(part, extraPayments, instantOf(closedOn), rateChanges)
  if (closedOn > todayIso(asOf)) return { ...simulatePart(part, extraPayments, asOf, rateChanges), closedOn, carriedOver: atClose.currentBalance }
  return {
    ...atClose,
    currentBalance: 0,
    monthlyPayment: 0,
    monthlyInterest: 0,
    monthlyPrincipal: 0,
    monthsRemaining: 0,
    projectedEndDate: closedOn,
    nextRateChange: null,
    closedOn,
    carriedOver: atClose.currentBalance,
  }
}
