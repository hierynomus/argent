import { addMonths, completedMonths } from "../lib/dates"
import { Decimal } from "./money"

export interface GrantInput {
  options: number
  vestingType: string
  vestStart: string | null
  cliffMonths: number
  vestMonths: number | null
}

/**
 * Options vested on `today` (ISO date). Exit-only grants never vest here (they pay out on an exit).
 * Time vesting is monthly: nothing before the cliff, then every completed month since the start counts,
 * up to the full vesting period (the cliff releases what has built up by then). Rounded down to 1/100 of an option.
 */
export function vestedOptions(g: GrantInput, today: string): number {
  if (g.vestingType !== "time" || !g.vestStart || !g.vestMonths) return 0
  const months = completedMonths(g.vestStart, today)
  if (months < g.cliffMonths) return 0
  // options × months ÷ total, exact, then rounded DOWN to 1/100 (no float fudge needed)
  return new Decimal(g.options).times(Math.min(months, g.vestMonths)).div(g.vestMonths).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber()
}

/** The date more options vest next (the cliff, then each month); null when fully vested or exit-only. */
export function nextVestingDate(g: GrantInput, today: string): string | null {
  if (g.vestingType !== "time" || !g.vestStart || !g.vestMonths) return null
  const months = completedMonths(g.vestStart, today)
  if (months >= g.vestMonths) return null
  return addMonths(g.vestStart, months < g.cliffMonths ? g.cliffMonths : months + 1)
}

/** The latest price dated `today` or earlier, flat until the next (on the same date the one entered last wins). */
export function currentPriceOf(prices: Array<{ priceDate: string; price: string }>, today: string): { price: number | null; date: string | null } {
  const latest = prices
    .filter((p) => p.priceDate <= today)
    .reduce<{ priceDate: string; price: string } | null>((best, p) => (best === null || p.priceDate >= best.priceDate ? p : best), null)
  return latest ? { price: parseFloat(latest.price), date: latest.priceDate } : { price: null, date: null }
}

/** What an option is worth with the given share price and strike: nothing when the price is below the strike. */
export const valuePerOption = (price: number | null, strike: number): number | null => (price === null ? null : Math.max(0, price - strike))
