export interface MonthRange {
  /** `YYYY-MM` */
  key: string
  from: string
  to: string
  /** noon UTC on the first day: for formatting the month's name */
  date: Date
}

/** The calendar month `offset` months before the one `today` (`YYYY-MM-DD`) is in; 0 is this month. Plain date arithmetic, no time zones. */
export function monthRange(today: string, offset: number): MonthRange {
  const [y, m] = today.split("-").map(Number) as [number, number]
  const index = y * 12 + (m - 1) - offset
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const key = `${year}-${String(month).padStart(2, "0")}`
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { key, from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}`, date: new Date(Date.UTC(year, month - 1, 1, 12)) }
}
