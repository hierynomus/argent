export interface ExtraPayment {
  paymentDate: string  // ISO date "YYYY-MM-DD"
  amount: string
}

export interface PartInput {
  type: string  // "linear" | "annuity" | "interest_only"
  principal: string
  annualInterestRate: string
  startDate: string  // ISO date
  endDate: string    // ISO date
}

export interface PartState {
  currentBalance: number
  monthlyPayment: number
  monthlyInterest: number
  monthlyPrincipal: number
  originalMonthlyPayment: number
  totalMonths: number
  monthsElapsed: number
  monthsRemaining: number
}

/** Number of complete calendar months from `from` to `to`, minimum 0. */
function monthsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()),
  )
}

/** Returns the calendar year+month key for a given year+month offset from a base date. */
function monthKey(base: Date, offsetMonths: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Parse an ISO date string to a UTC-noon Date to avoid timezone boundary issues. */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Round to the nearest cent (2 decimal places). */
function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compute the current amortization state for a mortgage part.
 *
 * Uses a month-by-month simulation so that extra payments are correctly
 * applied at the right point in the schedule regardless of type.
 *
 * Extra payments are bucketed by calendar month (YYYY-MM) and injected
 * at the START of that month (before that month's scheduled payment).
 */
export function computePartState(
  part: PartInput,
  extraPayments: ExtraPayment[],
  asOf: Date = new Date(),
): PartState {
  const principal = parseFloat(part.principal)
  const annualRate = parseFloat(part.annualInterestRate)
  const r = annualRate / 12  // monthly rate

  const start = parseDate(part.startDate)
  const end = parseDate(part.endDate)
  const totalMonths = Math.max(1, monthsBetween(start, end))
  const monthsElapsed = Math.min(totalMonths, monthsBetween(start, asOf))

  // Pre-compute the original (unaffected) monthly payment, rounded to cents
  let originalMonthlyPayment: number
  if (part.type === "annuity") {
    originalMonthlyPayment = cents(r === 0
      ? principal / totalMonths
      : principal * r / (1 - Math.pow(1 + r, -totalMonths)))
  } else if (part.type === "linear") {
    // For linear, the "original payment" is just the fixed principal portion
    originalMonthlyPayment = cents(principal / totalMonths)
  } else {
    // interest_only
    originalMonthlyPayment = cents(principal * r)
  }

  // Build a map: "YYYY-MM" → total extra payment amount in that month
  const extraByMonth = new Map<string, number>()
  for (const ep of extraPayments) {
    const key = ep.paymentDate.slice(0, 7)  // "YYYY-MM"
    extraByMonth.set(key, (extraByMonth.get(key) ?? 0) + parseFloat(ep.amount))
  }

  // Month-by-month simulation — all amounts rounded to cents at each step
  let balance = principal

  for (let m = 1; m <= monthsElapsed; m++) {
    // 1. Apply extra payments at the start of this month
    const key = monthKey(start, m - 1)
    const extra = extraByMonth.get(key) ?? 0
    if (extra > 0) {
      balance = Math.max(0, cents(balance - extra))
    }
    if (balance === 0) break

    // 2. Apply the scheduled payment for this month
    const interest = cents(balance * r)

    if (part.type === "linear") {
      const principalPayment = Math.min(balance, originalMonthlyPayment)
      balance = Math.max(0, cents(balance - principalPayment))
    } else if (part.type === "annuity") {
      const principalPayment = Math.min(balance, Math.max(0, originalMonthlyPayment - interest))
      balance = Math.max(0, cents(balance - principalPayment))
    }
    // interest_only: no principal reduction
  }

  // Apply any extra payments due in the current (not yet elapsed) month
  const currentMonthKey = monthKey(start, monthsElapsed)
  const currentExtra = extraByMonth.get(currentMonthKey) ?? 0
  if (currentExtra > 0) {
    balance = Math.max(0, cents(balance - currentExtra))
  }

  // Compute current month's payment components from remaining balance
  const currentMonthlyInterest = cents(balance * r)
  let currentMonthlyPrincipal: number

  if (part.type === "linear") {
    currentMonthlyPrincipal = balance > 0 ? Math.min(balance, originalMonthlyPayment) : 0
  } else if (part.type === "annuity") {
    currentMonthlyPrincipal = balance > 0
      ? Math.min(balance, Math.max(0, originalMonthlyPayment - currentMonthlyInterest))
      : 0
  } else {
    currentMonthlyPrincipal = 0
  }

  const currentMonthlyPayment = cents(currentMonthlyPrincipal + currentMonthlyInterest)

  return {
    currentBalance: Math.max(0, balance),
    monthlyPayment: currentMonthlyPayment,
    monthlyInterest: currentMonthlyInterest,
    monthlyPrincipal: currentMonthlyPrincipal,
    originalMonthlyPayment,
    totalMonths,
    monthsElapsed,
    monthsRemaining: totalMonths - monthsElapsed,
  }
}
