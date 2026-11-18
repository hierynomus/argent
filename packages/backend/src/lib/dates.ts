/**
 * Date arithmetic on `YYYY-MM-DD` strings, independent of the server's time zone.
 *
 * Dates are calendar dates, not instants: they are parsed, added and compared as plain year/month/day (UTC
 * is used only as a neutral calendar), never through the local time zone — a local `Date` makes "two days
 * later" come out a day early across a daylight-saving change in some zones (e.g. Europe/Amsterdam).
 */

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, "0")
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return { y, m, d }
}
const format = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

/** The calendar date of an instant, in UTC. This is what "today" means on the server. */
export const todayIso = (now: Date = new Date()) => now.toISOString().slice(0, 10)

/** `iso` plus `days` days. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso)
  return format(new Date(Date.UTC(y, m - 1, d + days)))
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const day = (iso: string) => {
    const { y, m, d } = parse(iso)
    return Date.UTC(y, m - 1, d) / DAY_MS
  }
  return day(b) - day(a)
}

/** `iso` plus `months` months on the same day of the month, clamped to the last day of shorter months. */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parse(iso)
  const first = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`
}

/** Calendar-month difference from `from` to `to` (the day of the month is ignored), minimum 0. */
export function monthsBetween(from: string, to: string): number {
  const a = parse(from)
  const b = parse(to)
  return Math.max(0, (b.y - a.y) * 12 + (b.m - a.m))
}

/** Whole months from `start` that have passed by `asOf` (the day of the month counts); 0 before the start. */
export function completedMonths(start: string, asOf: string): number {
  if (asOf < start) return 0
  let months = monthsBetween(start, asOf)
  while (months > 0 && addMonths(start, months) > asOf) months--
  return months
}
