import { addMonths, daysBetween, monthsBetween, todayIso } from "../lib/dates"
import { cents, Decimal } from "./money"

export interface ExtraPayment {
  paymentDate: string  // ISO date "YYYY-MM-DD"
  amount: string
  /** "shorten_term" (default): the installment stays and the part ends earlier; "lower_payment": the installment goes down and the end date stays */
  effect?: string | null
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
 *  - By default the scheduled payment stays the same, so extra payments shorten the term (see `monthsRemaining`).
 *    An extra payment with effect `lower_payment` instead spreads what is left over the contract months that
 *    remain (an annuity's installment, or a linear part's principal portion goes down) from the next installment on.
 */
function simulatePart(
  part: PartInput,
  extraPayments: ExtraPayment[],
  asOf: Date,
  rateChanges: RateChange[],
  /** when given, receives the balance after every installment (and the starting balance) */
  trace?: SchedulePoint[],
): Omit<PartState, "closedOn" | "carriedOver"> & { interestPaid: number; paymentsMade: number } {
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
  // a linear part repays the same principal every month, until an extra payment lowers it
  let linearPortion = originalMonthlyPayment
  // after an extra payment that lowers the payment: spread what is left over the months left in the contract
  const lowerPayment = (balance: number, paymentsMade: number) => {
    const monthsLeft = totalMonths - paymentsMade
    if (balance <= 0 || monthsLeft <= 0) return
    if (part.type === "annuity") installment = annuityPayment(balance, r, monthsLeft)
    else if (part.type === "linear") linearPortion = cents(balance / monthsLeft)
  }
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
    .map((e) => ({ date: e.paymentDate, amount: parseFloat(e.amount), lowers: e.effect === "lower_payment" }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let ei = 0

  let balance = principal
  // extra payments on/before the start date reduce the principal before any interest accrues
  let loweredAtStart = false
  while (ei < extras.length && extras[ei].date <= start) {
    loweredAtStart ||= extras[ei].lowers
    balance = Math.max(0, cents(balance - extras[ei++].amount))
  }
  if (loweredAtStart) lowerPayment(balance, 0)

  // Payment-by-payment simulation — all amounts rounded to cents at each step
  let previous = anchor > start ? anchor : start
  let interestPaid = new Decimal(0)
  let paymentsMade = 0
  trace?.push({ date: start, balance: balance })
  for (let m = 1; m <= monthsElapsed; m++) {
    const due = paymentDate(m)
    const openingBalance = balance
    const periodDays = Math.max(1, daysBetween(previous, due))
    reprice(m, balance)
    let interest = cents(balance * r)
    let lowered = false

    // extra payments made during this period (after the previous payment, up to and including this one)
    while (ei < extras.length && extras[ei].date <= due) {
      lowered ||= extras[ei].lowers
      const amount = Math.min(balance, extras[ei].amount)
      interest = Math.max(0, cents(interest - (amount * r * daysBetween(extras[ei].date, due)) / periodDays))
      balance = cents(balance - amount)
      ei++
    }
    interestPaid = interestPaid.plus(interest)
    if (balance === 0) {
      if (trace && trace[trace.length - 1]?.balance !== 0) trace.push({ date: due, balance: 0 })
      paymentsMade = openingBalance > 0 ? m : m - 1 // an extra payment can be the last one; otherwise it was repaid before
      break
    }
    paymentsMade = m
    // the installment that follows an extra payment is the lowered one (also the one due in this very period)
    if (lowered) lowerPayment(balance, m - 1)

    if (part.type === "linear") {
      balance = Math.max(0, cents(balance - Math.min(balance, linearPortion)))
    } else if (part.type === "annuity") {
      balance = Math.max(0, cents(balance - Math.min(balance, Math.max(0, installment - interest))))
    }
    // interest_only: no principal reduction
    trace?.push({ date: due, balance })
    previous = due
  }

  // the period that is under way now: its rate (and an annuity's installment) apply to the next payment
  reprice(monthsElapsed + 1, balance)
  // extra payments made since the last payment (the current, not yet completed period)
  let loweredNow = false
  while (ei < extras.length && extras[ei].date <= today) {
    loweredNow ||= extras[ei].lowers
    balance = Math.max(0, cents(balance - extras[ei++].amount))
  }
  if (loweredNow) lowerPayment(balance, monthsElapsed)

  // Components of the next payment, from the remaining balance
  const currentMonthlyInterest = cents(balance * r)
  let currentMonthlyPrincipal: number
  if (part.type === "linear") {
    currentMonthlyPrincipal = balance > 0 ? Math.min(balance, linearPortion) : 0
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
    monthsRemaining = Math.min(scheduledRemaining, Math.ceil(balance / linearPortion - 1e-9))
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
    interestPaid: cents(interestPaid),
    paymentsMade,
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
  const state = (at: Date) => {
    const { interestPaid: _i, paymentsMade: _p, ...rest } = simulatePart(part, extraPayments, at, rateChanges)
    return rest
  }
  if (!closedOn) return { ...state(asOf), closedOn: null, carriedOver: null }

  const atClose = state(instantOf(closedOn))
  if (closedOn > todayIso(asOf)) return { ...state(asOf), closedOn, carriedOver: atClose.currentBalance }
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

export interface ExtraPaymentImpact {
  /** extra payments made so far (dated today or earlier) and what they add up to */
  count: number
  totalExtra: number
  /** interest over the whole life of the part, as it goes now and had nothing extra been paid */
  interestWithExtra: number
  interestWithoutExtra: number
  /** how much of each has been paid up to today (it differs: without the extras more interest would have been paid by now) */
  interestPaidToDate: number
  interestPaidToDateWithoutExtra: number
  interestSaved: number
  /** payments no longer needed, and the dates of the last payment with and without the extras */
  monthsSaved: number
  endDate: string
  endDateWithoutExtra: string
}

/**
 * What the extra payments made so far are worth: the part is run to its end twice, once with them and once
 * as if they had never been made, and the interest and the last payment date are compared. Later payments
 * stay as scheduled (the installment, with any rate changes entered), and extra payments dated in the future
 * are left out of both, so this is what has been achieved, not a forecast. Null for a part without extra
 * payments so far, and for a closed one (its remainder went into other parts, which cannot be compared).
 */
export function extraPaymentImpact(part: PartInput, extraPayments: ExtraPayment[], asOf: Date = new Date(), rateChanges: RateChange[] = []): ExtraPaymentImpact | null {
  const today = todayIso(asOf)
  const made = extraPayments.filter((e) => e.paymentDate <= today)
  if (part.closedOn || made.length === 0) return null
  const horizon = instantOf(addMonths(part.endDate, 2)) // past the last scheduled payment
  const full = (extras: ExtraPayment[]) => simulatePart(part, extras, horizon, rateChanges)
  const withExtra = full(made)
  const without = full([])
  const lastDate = (paymentsMade: number) => (paymentsMade <= 0 ? part.startDate : part.firstPaymentDate ? addMonths(part.firstPaymentDate, paymentsMade - 1) : addMonths(part.startDate, paymentsMade))
  return {
    count: made.length,
    totalExtra: cents(made.reduce((sum, e) => sum.plus(e.amount), new Decimal(0))),
    interestWithExtra: withExtra.interestPaid,
    interestWithoutExtra: without.interestPaid,
    interestPaidToDate: simulatePart(part, made, asOf, rateChanges).interestPaid,
    interestPaidToDateWithoutExtra: simulatePart(part, [], asOf, rateChanges).interestPaid,
    interestSaved: cents(new Decimal(without.interestPaid).minus(withExtra.interestPaid)),
    monthsSaved: Math.max(0, without.paymentsMade - withExtra.paymentsMade),
    endDate: lastDate(withExtra.paymentsMade),
    endDateWithoutExtra: lastDate(without.paymentsMade),
  }
}

export interface SchedulePoint {
  date: string
  balance: number
}

export interface BalanceSchedule {
  /** the balance after each installment, from the start to the last one: what was paid is real, the rest a projection */
  actual: SchedulePoint[]
  /** the same without any extra payment, or null when there is none to compare with */
  scheduled: SchedulePoint[] | null
}

/**
 * The balance of a part over its whole life: month by month as it goes with the extra payments (those dated in
 * the future too), and, when there are extra payments, as it would have gone without them. A closed part ends at
 * zero on the day it was closed (what was left moved to its continuation).
 */
export function balanceSchedule(part: PartInput, extraPayments: ExtraPayment[], rateChanges: RateChange[] = []): BalanceSchedule {
  const closedOn = part.closedOn ?? null
  const run = (extras: ExtraPayment[]) => {
    const trace: SchedulePoint[] = []
    simulatePart({ ...part, closedOn: null }, extras, instantOf(closedOn ?? addMonths(part.endDate, 2)), rateChanges, trace)
    const points = closedOn ? trace.filter((p) => p.date < closedOn) : trace
    // lines are drawn from the points: close the part with a zero on its closing day
    return closedOn ? [...points, { date: closedOn, balance: 0 }] : points
  }
  return { actual: run(extraPayments), scheduled: extraPayments.length > 0 ? run([]) : null }
}

/**
 * The balances of several parts added up: on every date any of them has a point, each part counts with its
 * latest balance up to then (nothing before it started, its last balance, normally zero, after it ended).
 */
export function sumSchedules(series: SchedulePoint[][]): SchedulePoint[] {
  const dates = [...new Set(series.flatMap((s) => s.map((p) => p.date)))].sort()
  const cursor = series.map(() => 0)
  return dates.map((date) => {
    let total = new Decimal(0)
    series.forEach((points, i) => {
      while (cursor[i]! < points.length && points[cursor[i]!]!.date <= date) cursor[i]!++
      const latest = points[cursor[i]! - 1]
      if (latest) total = total.plus(latest.balance)
    })
    return { date, balance: cents(total) }
  })
}
