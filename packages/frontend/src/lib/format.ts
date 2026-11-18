/**
 * Number, currency and date formatting shared by all pages.
 *
 * Money from the API arrives as decimal strings (Postgres `numeric`); amounts computed
 * by the backend (P&L, valuations) arrive as numbers. Both are handled here so pages
 * never re-implement formatting.
 */

/** Fixed-decimals number, e.g. `1,234.50`. */
export function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-EU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Quantity with at most `digits` significant digits, e.g. `0.12345678` BTC (crypto balances). */
export function fmtSignificant(n: number, digits = 8): string {
  return n.toLocaleString("en-US", { maximumSignificantDigits: digits })
}

/** Quantity with at most `max` decimals, e.g. `12.3457` shares. */
export function fmtMaxDecimals(n: number, max = 4): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: max })
}

/** `gold` → `Gold`. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Currency via `Intl` in the browser's locale, e.g. `€1,234.50` / `1.234,50 €`. */
export function fmtCur(n: number, currency = "EUR"): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n)
}

/** Investment-style amount: a `$` / `€` prefix followed by `fmt(n)`, e.g. `€1,234.50`. */
export function fmtSymbolCur(n: number, currency: string): string {
  return (currency === "USD" ? "$" : "€") + fmt(n)
}

/** Tailwind text colour for a profit/loss figure (green / red / neutral). */
export function pnlColor(n: number): string {
  if (n > 0) return "text-green-600 dark:text-green-400"
  if (n < 0) return "text-red-600 dark:text-red-400"
  return "text-gray-500 dark:text-gray-400"
}

/** Signed profit/loss, e.g. `+€120.00` / `-€45.50`. Zero counts as positive. */
export function pnlFmt(n: number, currency: string): string {
  return (n >= 0 ? "+" : "") + fmtSymbolCur(n, currency)
}

/**
 * Account balance from a decimal string. `locale` defaults to the browser's; the admin
 * and settings screens pin `nl-NL` so balances read the same for everyone.
 */
export function fmtBalance(balance: string, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(parseFloat(balance))
}

/** Transaction amount with an explicit sign: credits `+`, debits `-`. */
export function fmtAmount(amount: string, indicator: "CRDT" | "DBIT", currency: string): string {
  const formatted = fmtBalance(amount, currency)
  return indicator === "CRDT" ? `+${formatted}` : `-${formatted}`
}

/**
 * Amount with an explicit sign taken from the debit/credit indicator, in Dutch format:
 * credits `€ +12,50`, debits `€ -12,50`. (Used where amounts are listed next to each other.)
 */
export function fmtSignedAmount(amount: string, indicator: string, currency: string, locale = "nl-NL"): string {
  const n = parseFloat(amount)
  return new Intl.NumberFormat(locale, { style: "currency", currency, signDisplay: "always" }).format(indicator === "DBIT" ? -n : n)
}

/** Interest rate stored as a fraction (`"0.035"`) shown as a percentage (`3.50%`). */
export function fmtRate(rate: string): string {
  return `${(parseFloat(rate) * 100).toFixed(2)}%`
}

const parseDay = (date: string) => new Date(date + "T00:00:00")

/** `Mar 5, 2024` (locale-dependent). Input: `YYYY-MM-DD`. */
export function fmtDate(date: string): string {
  return parseDay(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

/** `05 Mar` (locale-dependent). Input: `YYYY-MM-DD`. */
export function fmtDayMonth(date: string): string {
  return parseDay(date).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
}

/** `Mar 2024` (locale-dependent). Input: `YYYY-MM-DD`. */
export function fmtMonthYear(date: string): string {
  return parseDay(date).toLocaleDateString(undefined, { year: "numeric", month: "short" })
}

/** `March 2024` (locale-dependent). */
export function fmtMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}
