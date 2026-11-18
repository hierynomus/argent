/** Date arithmetic on `YYYY-MM-DD` strings in local calendar terms (no timezone shifting). */

/** `iso` plus `months` months on the same day of the month, clamped to the last day of shorter months. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const first = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(d, lastDay))}`
}

/** Whole months from `start` that have passed by `asOf` (the day of the month counts); 0 before the start. */
export function completedMonths(start: string, asOf: string): number {
  if (asOf < start) return 0
  const [sy, sm] = start.split("-").map(Number)
  const [ay, am] = asOf.split("-").map(Number)
  let months = (ay - sy) * 12 + (am - sm)
  while (months > 0 && addMonths(start, months) > asOf) months--
  return months
}
