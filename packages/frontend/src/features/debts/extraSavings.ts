import type { ExtraPaymentImpact } from "@argent/shared"

/** Months as "3 years 2 months", "11 months", "1 month". */
export function fmtMonths(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years > 0 ? `${years} ${years === 1 ? "year" : "years"}` : ""
  const m = rest > 0 || years === 0 ? `${rest} ${rest === 1 ? "month" : "months"}` : ""
  return [y, m].filter(Boolean).join(" ")
}

/**
 * The savings of all parts of one mortgage/loan that have extra payments (one currency) as one figure; null when none has.
 * The parts run side by side, so the debt is paid off when its last part is: the months saved are the most of any part,
 * and the end dates the latest ones.
 */
export function sumImpacts(impacts: Array<ExtraPaymentImpact | null | undefined>): ExtraPaymentImpact | null {
  const found = impacts.filter((i): i is ExtraPaymentImpact => !!i)
  if (found.length === 0) return null
  const sum = (pick: (i: ExtraPaymentImpact) => number) => found.reduce((n, i) => n + Math.round(pick(i) * 100), 0) / 100
  const latest = (pick: (i: ExtraPaymentImpact) => string) => found.map(pick).sort().at(-1)!
  return {
    count: found.reduce((n, i) => n + i.count, 0),
    totalExtra: sum((i) => i.totalExtra),
    interestWithExtra: sum((i) => i.interestWithExtra),
    interestWithoutExtra: sum((i) => i.interestWithoutExtra),
    interestPaidToDate: sum((i) => i.interestPaidToDate),
    interestPaidToDateWithoutExtra: sum((i) => i.interestPaidToDateWithoutExtra),
    interestSaved: sum((i) => i.interestSaved),
    monthsSaved: Math.max(...found.map((i) => i.monthsSaved)),
    endDate: latest((i) => i.endDate),
    endDateWithoutExtra: latest((i) => i.endDateWithoutExtra),
  }
}
