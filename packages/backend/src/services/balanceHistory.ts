import { Decimal } from "./money"

export interface BalancePoint {
  date: string
  balance: string
}

/**
 * The balance at the end of each day that had transactions, as a running sum: the opening balance plus
 * every day's net amount (credits minus debits) on or after the opening date. Computed on request from the
 * transactions themselves, so an import, edit or delete is reflected at once and nothing is stored.
 * The series starts at the opening date (when there is one) and is carried on to `today`.
 */
export function balanceHistory(opening: string, openingDate: string | null, daily: Array<{ date: string; net: string }>, today: string): BalancePoint[] {
  const days = daily.filter((d) => !openingDate || d.date >= openingDate).sort((a, b) => a.date.localeCompare(b.date))
  let balance = new Decimal(opening)
  const points: BalancePoint[] = []
  const first = openingDate ?? days[0]?.date
  if (first && (days.length === 0 || days[0]!.date > first)) points.push({ date: first, balance: balance.toFixed(2) })
  for (const d of days) {
    balance = balance.plus(d.net)
    points.push({ date: d.date, balance: balance.toFixed(2) })
  }
  const last = points[points.length - 1]
  if (last && last.date < today) points.push({ date: today, balance: last.balance })
  return points
}
