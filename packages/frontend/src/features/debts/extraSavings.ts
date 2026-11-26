import type { ExtraPaymentImpact } from "@argent/shared"

/** Months as "3 years 2 months", "11 months", "1 month". */
export function fmtMonths(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : ""
  const m = rest > 0 || years === 0 ? `${rest} ${rest === 1 ? "month" : "months"}` : ""
  return [y, m].filter(Boolean).join(" ")
}

/** The totals over the parts of one mortgage/loan that have extra payments (one currency); null when none has. */
export function sumImpacts(impacts: Array<ExtraPaymentImpact | null | undefined>): { count: number; totalExtra: number; interestSaved: number } | null {
  const found = impacts.filter((i): i is ExtraPaymentImpact => !!i)
  if (found.length === 0) return null
  const cents = (n: number) => Math.round(n * 100)
  return {
    count: found.reduce((n, i) => n + i.count, 0),
    totalExtra: found.reduce((n, i) => n + cents(i.totalExtra), 0) / 100,
    interestSaved: found.reduce((n, i) => n + cents(i.interestSaved), 0) / 100,
  }
}
