import type { Debt } from "../../api"

export interface Repaid {
  /** what was borrowed (the parts that were not continued from another one, plus the first month's interest added to them) */
  original: number
  /** what is left */
  left: number
  /** what has been repaid: all of it, of which the part that came from extra payments */
  repaid: number
  extra: number
  /** repaid as a share of `original`, 0-100 */
  percent: number
}

/**
 * How much of a mortgage/loan has been repaid. A part that continues another one (when the rate period ended
 * and the rest was split anew) is not borrowed again, so only the original parts count towards what was
 * borrowed; what is left is the balance of the parts that are still open.
 */
export function repaidSoFar(debt: Debt, today: string): Repaid | null {
  const originals = debt.parts.filter((p) => !p.continuesPartId)
  const original = Math.round(originals.reduce((n, p) => n + (parseFloat(p.principal) + (p.capitalizedInterest ?? 0)) * 100, 0)) / 100
  if (original <= 0) return null
  const left = Math.min(original, Math.max(0, debt.totalCurrentBalance))
  const repaid = Math.round((original - left) * 100) / 100
  const extraPaid = debt.parts.reduce((n, p) => n + p.extraPayments.filter((e) => e.paymentDate <= today).reduce((m, e) => m + Math.round(parseFloat(e.amount) * 100), 0), 0) / 100
  const extra = Math.min(repaid, extraPaid)
  return { original, left, repaid, extra, percent: (repaid / original) * 100 }
}
