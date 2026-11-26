import type { HistoryRange } from "@argent/shared"

export interface DayBalance {
  date: string
  balance: string
}

const MONTHS: Record<Exclude<HistoryRange, "max">, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }

/** `YYYY-MM-DD` minus whole months, clamped to the month's last day (31 Mar - 1 month = 28 Feb); no time zones involved. */
function minusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) - months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`
}

/**
 * The part of a balance history inside a range ending at the last point. The line starts on the first day of
 * the range at the balance it had then (the latest point before it), so a short range doesn't begin mid-air.
 */
export function sliceRange<T extends { date: string }>(points: T[], range: HistoryRange): T[] {
  const last = points[points.length - 1]
  if (range === "max" || !last) return points
  const from = minusMonths(last.date, MONTHS[range])
  const before = [...points].reverse().find((p) => p.date < from)
  const inside = points.filter((p) => p.date >= from)
  return before ? [{ ...before, date: from }, ...inside] : inside
}
