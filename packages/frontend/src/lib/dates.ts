/** Date arithmetic on `YYYY-MM-DD` strings, in local calendar terms (no timezone shifting). */

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return { y, m, d }
}
const pad = (n: number) => String(n).padStart(2, "0")

/**
 * `iso` plus `months` months, on the same day of the month (clamped to the last day of shorter
 * months: 31 Jan + 1 month = 28/29 Feb). Returns "" for an invalid date or a non-integer month count.
 */
export function addMonths(iso: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(months)) return ""
  const { y, m, d } = parse(iso)
  const first = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(d, lastDay))}`
}

/** Whole calendar months from `from` to `to` (the day of the month is ignored), minimum 0. */
export function monthsBetween(from: string, to: string): number {
  const a = parse(from)
  const b = parse(to)
  return Math.max(0, (b.y - a.y) * 12 + (b.m - a.m))
}

/** Today's calendar date (UTC, like the server's "today"). */
export const todayIso = (): string => new Date().toISOString().slice(0, 10)
