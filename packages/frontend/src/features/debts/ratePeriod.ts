import { addMonths, todayIso } from "../../lib/dates"

/** A part whose fixed-rate period ends within this many months is highlighted: the bank's new offer is due. */
export const RATE_REMINDER_MONTHS = 3

/**
 * Whether the rate of a part changes within the next three months (today included): the row is highlighted
 * so the end of a fixed-rate period is not missed. A closed part, or a change further away, is not.
 */
export function rateChangeSoon(part: { closedOn?: string | null; nextRateChange?: { effectiveDate: string } | null }, today = todayIso()): boolean {
  const change = part.nextRateChange
  if (!change || part.closedOn) return false
  return change.effectiveDate >= today && change.effectiveDate <= addMonths(today, RATE_REMINDER_MONTHS)
}
