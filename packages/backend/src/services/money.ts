import Decimal from "decimal.js"

/**
 * Exact decimal arithmetic for money and quantities.
 *
 * Binary floats cannot hold 0.1 or 1.005 exactly, so sums and ratios drift (a thousand buys of 0.10 EUR did
 * not add up to 100 EUR), and `Math.round(n * 100) / 100` rounds 1.005 to 1.00. Amounts that are summed,
 * split or rounded go through `Decimal` instead. Plain numbers remain fine for display values and for
 * quantities that are only compared, never accumulated.
 */
export { Decimal }

// 28 significant digits: far more than any amount here (numeric(30,8) is the widest column)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type DecimalLike = Decimal.Value

/** Round to whole cents, half up (1.005 → 1.01), as a plain number. */
export const cents = (n: DecimalLike): number => new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()

/**
 * Below this a quantity counts as "none left". With exact decimal arithmetic a fully sold position is exactly
 * 0; this only absorbs the last float digits of a quantity that has been converted to a number.
 */
export const DUST_QUANTITY = 1e-10

/** True when a position still holds something (for sorting and hiding closed positions). */
export const isOpenQuantity = (quantity: number): boolean => quantity > DUST_QUANTITY

/**
 * Whether `amount` (a decimal string from a request) is more than `balance` (a number computed from exact
 * decimals, so converting it back to the column's 8 decimals is exact).
 */
export const exceedsBalance = (amount: DecimalLike, balance: number): boolean =>
  new Decimal(amount).greaterThan(new Decimal(balance).toDecimalPlaces(8, Decimal.ROUND_HALF_UP))
