import { addMonths, daysBetween, monthsBetween, todayIso } from "../lib/dates"

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
  startDate: string  // ISO date
  endDate: string    // ISO date
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
}

// Dates are `YYYY-MM-DD` strings handled by lib/dates.ts (time-zone independent); "today" is the UTC date.
// Payment m is due `m` months after the start, on the start's day of the month (clamped to short months).
const paymentDate = addMonths

/** The monthly interest rate for an annual rate, depending on how it is quoted. */
export function monthlyRate(annualRate: number, rateType: string = "nominal"): number {
  return rateType === "effective" ? Math.pow(1 + annualRate, 1 / 12) - 1 : annualRate / 12
}

/** Round to the nearest cent (2 decimal places). */
function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compute the current amortization state for a mortgage/loan part.
 *
 * Payment m is due on the start date's day of the month, m months after the start (so a part that
 * starts on the 28th has its first payment on the 28th of the next month). `monthsElapsed` counts the
 * payments whose date has passed. The simulation walks the payments one by one:
 *
 *  - Interest of a period is the opening balance times the monthly rate (see `monthlyRate`).
 *  - An extra payment takes effect on its own date. It lowers the balance at once, and lowers that
 *    period's interest in proportion to the days left until the payment date.
 *  - The scheduled payment stays the same, so extra payments shorten the term (see `monthsRemaining`).
 */
export function computePartState(
  part: PartInput,
  extraPayments: ExtraPayment[],
  asOf: Date = new Date(),
): PartState {
  const principal = parseFloat(part.principal)
  const r = monthlyRate(parseFloat(part.annualInterestRate), part.rateType)

  const start = part.startDate
  const end = part.endDate
  const today = todayIso(asOf)
  const totalMonths = Math.max(1, monthsBetween(start, end))
  let monthsElapsed = 0
  while (monthsElapsed < totalMonths && paymentDate(start, monthsElapsed + 1) <= today) monthsElapsed++

  // The original (unaffected) monthly payment, rounded to cents
  let originalMonthlyPayment: number
  if (part.type === "annuity") {
    originalMonthlyPayment = cents(r === 0 ? principal / totalMonths : (principal * r) / (1 - Math.pow(1 + r, -totalMonths)))
  } else if (part.type === "linear") {
    // For linear, the "original payment" is just the fixed principal portion
    originalMonthlyPayment = cents(principal / totalMonths)
  } else {
    // interest_only
    originalMonthlyPayment = cents(principal * r)
  }

  const extras = extraPayments
    .map((e) => ({ date: e.paymentDate, amount: parseFloat(e.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  let ei = 0

  let balance = principal
  // extra payments on/before the start date reduce the principal before any interest accrues
  while (ei < extras.length && extras[ei].date <= start) balance = Math.max(0, cents(balance - extras[ei++].amount))

  // Payment-by-payment simulation — all amounts rounded to cents at each step
  let previous = start
  for (let m = 1; m <= monthsElapsed; m++) {
    const due = paymentDate(start, m)
    const periodDays = Math.max(1, daysBetween(previous, due))
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
      balance = Math.max(0, cents(balance - Math.min(balance, Math.max(0, originalMonthlyPayment - interest))))
    }
    // interest_only: no principal reduction
    previous = due
  }

  // extra payments made since the last payment (the current, not yet completed period)
  while (ei < extras.length && extras[ei].date <= today) balance = Math.max(0, cents(balance - extras[ei++].amount))

  // Components of the next payment, from the remaining balance
  const currentMonthlyInterest = cents(balance * r)
  let currentMonthlyPrincipal: number
  if (part.type === "linear") {
    currentMonthlyPrincipal = balance > 0 ? Math.min(balance, originalMonthlyPayment) : 0
  } else if (part.type === "annuity") {
    currentMonthlyPrincipal = balance > 0 ? Math.min(balance, Math.max(0, originalMonthlyPayment - currentMonthlyInterest)) : 0
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
    let b = balance
    let n = 0
    while (b > 0 && n < scheduledRemaining) {
      const interest = cents(b * r)
      const principalPaid = originalMonthlyPayment - interest
      if (principalPaid <= 0) break
      b = cents(b - Math.min(b, principalPaid))
      n++
    }
    // still not repaid at the end of the schedule (rounding leftovers, or a payment that doesn't cover the interest)
    monthsRemaining = b > 0 ? scheduledRemaining : n
  }

  return {
    currentBalance: Math.max(0, balance),
    monthlyPayment: currentMonthlyPayment,
    monthlyInterest: currentMonthlyInterest,
    monthlyPrincipal: currentMonthlyPrincipal,
    originalMonthlyPayment,
    totalMonths,
    monthsElapsed,
    monthsRemaining,
    projectedEndDate: paymentDate(start, monthsElapsed + monthsRemaining),
  }
}
