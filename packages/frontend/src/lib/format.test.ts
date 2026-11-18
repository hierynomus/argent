import { describe, expect, test } from "vitest"
import {
  APP_LOCALE, capitalize, fmt, fmtAmount, fmtBalance, fmtCur, fmtDate, fmtDayMonth, fmtMaxDecimals, fmtSignedAmount, fmtMonthLabel, fmtMonthYear,
  fmtPrice, fmtRate, fmtSignificant, fmtSymbolCur, pnlColor, pnlFmt,
} from "./format"

/** Locale-independent comparison: collapse every kind of space (NBSP, narrow NBSP) to a plain one. */
const norm = (s: string) => s.replace(/[  ]/g, " ")

describe("fmt", () => {
  test("fixed two decimals with thousands separators", () => {
    expect(fmt(1234.5)).toBe("1.234,50")
    expect(fmt(0)).toBe("0,00")
    expect(fmt(1_000_000)).toBe("1.000.000,00")
  })
  test("rounds half up at the requested precision", () => {
    expect(fmt(1.005, 2)).toBe("1,01")
    expect(fmt(2.5, 0)).toBe("3")
    expect(fmt(0.123456789, 8)).toBe("0,12345679")
  })
  test("negative numbers keep their sign", () => {
    expect(fmt(-42.1)).toBe("-42,10")
  })
})

describe("fmtSymbolCur / pnlFmt", () => {
  test("USD gets $, everything else €", () => {
    expect(fmtSymbolCur(1234.5, "USD")).toBe("$1.234,50")
    expect(fmtSymbolCur(1234.5, "EUR")).toBe("€1.234,50")
    expect(fmtSymbolCur(1, "GBP")).toBe("€1,00") // only EUR/USD are supported currencies
  })
  test("negative amounts put the sign after the symbol", () => {
    expect(fmtSymbolCur(-5, "EUR")).toBe("€-5,00")
  })
  test("pnlFmt prefixes + for gains and zero, and relies on the number's own sign for losses", () => {
    expect(pnlFmt(120, "EUR")).toBe("+€120,00")
    expect(pnlFmt(0, "EUR")).toBe("+€0,00")
    expect(pnlFmt(-45.5, "USD")).toBe("$-45,50")
  })
})

describe("fmtPrice", () => {
  test("prices of 1 and up read like money", () => {
    expect(fmtPrice(1234.5, "EUR")).toBe("€1.234,50")
    expect(fmtPrice(1, "USD")).toBe("$1,00")
    expect(fmtPrice(0, "EUR")).toBe("€0,00")
  })
  test("sub-unit prices get four significant digits", () => {
    expect(fmtPrice(0.5, "EUR")).toBe("€0,50")
    expect(fmtPrice(0.05123456, "EUR")).toBe("€0,05123")
    expect(fmtPrice(0.0000085, "EUR")).toBe("€0,0000085")
    expect(fmtPrice(0.00000712345, "USD")).toBe("$0,000007123")
    expect(fmtPrice(0.000000005, "EUR")).toBe("€0,000000005")
  })
  test("never more than 12 decimals, and negative values keep the sign", () => {
    expect(fmtPrice(1e-15, "EUR")).toBe("€0,00")
    expect(fmtPrice(-0.0000085, "EUR")).toBe("€-0,0000085")
  })
})

describe("pnlColor", () => {
  test("green for gains, red for losses, grey for zero", () => {
    expect(pnlColor(0.01)).toContain("green")
    expect(pnlColor(-0.01)).toContain("red")
    expect(pnlColor(0)).toContain("gray")
  })
  test("every colour has a dark-mode variant", () => {
    for (const n of [1, -1, 0]) expect(pnlColor(n)).toContain("dark:")
  })
})

describe("fmtBalance", () => {
  test("explicit locale: Dutch formatting", () => {
    expect(norm(fmtBalance("1234.56", "EUR", "nl-NL"))).toBe("€ 1.234,56")
    expect(norm(fmtBalance("-10", "EUR", "nl-NL"))).toBe("€ -10,00")
  })
  test("the app locale is Dutch, whatever the browser says", () => {
    expect(APP_LOCALE).toBe("nl-NL")
    expect(norm(fmtBalance("1234.56", "EUR"))).toBe("€ 1.234,56")
    expect(norm(fmtCur(1234.56))).toBe("€ 1.234,56")
  })
  test("explicit locale: US formatting", () => {
    expect(fmtBalance("1234.56", "USD", "en-US")).toBe("$1,234.56")
  })
  test("without a locale it uses the environment default but still formats the number", () => {
    const out = fmtBalance("1234.56", "EUR")
    expect(out).toContain("€")
    expect(out.replace(/\D/g, "")).toBe("123456")
  })
  test("accepts decimal strings of any scale", () => {
    expect(fmtBalance("0", "USD", "en-US")).toBe("$0.00")
    expect(fmtBalance("0.1", "USD", "en-US")).toBe("$0.10")
    expect(fmtBalance("10.999", "USD", "en-US")).toBe("$11.00")
  })
})

describe("fmtCur", () => {
  test("defaults to EUR", () => {
    expect(fmtCur(5)).toContain("€")
    expect(fmtCur(5, "USD")).toContain("$")
  })
  test("is the numeric counterpart of fmtBalance", () => {
    expect(fmtCur(1234.56, "EUR")).toBe(fmtBalance("1234.56", "EUR"))
  })
})

describe("fmtAmount", () => {
  test("credits are prefixed with +, debits with -", () => {
    expect(fmtAmount("12.50", "CRDT", "EUR").startsWith("+")).toBe(true)
    expect(fmtAmount("12.50", "DBIT", "EUR").startsWith("-")).toBe(true)
  })
  test("the sign comes from the indicator, never from the amount", () => {
    const a = fmtAmount("12.50", "DBIT", "EUR")
    expect(a.replace(/\D/g, "")).toBe("1250")
    expect(a.match(/-/g)).toHaveLength(1)
  })
})

describe("fmtRate", () => {
  test("fraction → percentage with two decimals", () => {
    expect(fmtRate("0.035")).toBe("3.50%")
    expect(fmtRate("0.0425")).toBe("4.25%")
    expect(fmtRate("0")).toBe("0.00%")
    expect(fmtRate("1")).toBe("100.00%")
  })
})

describe("dates", () => {
  // Avoid asserting locale-specific month names: check the pieces that must be present.
  test("fmtDate shows day and year", () => {
    const out = fmtDate("2024-03-05")
    expect(out).toContain("2024")
    expect(out).toMatch(/\b5\b/)
  })
  test("fmtDate does not shift the day across time zones (parsed as local midnight)", () => {
    expect(fmtDate("2024-01-01")).toMatch(/\b1\b/)
    expect(fmtDate("2024-12-31")).toMatch(/\b31\b/)
    expect(fmtDate("2024-12-31")).toContain("2024")
  })
  test("fmtDayMonth has no year, and a two-digit day", () => {
    const out = fmtDayMonth("2024-03-05")
    expect(out).not.toContain("2024")
    expect(out).toContain("05")
  })
  test("fmtMonthYear has the year but no day", () => {
    const out = fmtMonthYear("2024-03-05")
    expect(out).toContain("2024")
    expect(out).not.toMatch(/\b05\b/)
  })
  test("fmtMonthLabel uses the full month name and the year", () => {
    const out = fmtMonthLabel(new Date(2024, 2, 15))
    expect(out).toContain("2024")
    expect(out.length).toBeGreaterThan("Mar 2024".length) // long month name, not abbreviated
  })
})

describe("quantities", () => {
  test("fmtSignificant limits significant digits, not decimals", () => {
    expect(fmtSignificant(0.123456789, 8)).toBe("0,12345679")
    expect(fmtSignificant(1234.56789, 6)).toBe("1.234,57")
    expect(fmtSignificant(1_000_000, 8)).toBe("1.000.000")
  })
  test("fmtMaxDecimals trims trailing zeros", () => {
    expect(fmtMaxDecimals(10)).toBe("10")
    expect(fmtMaxDecimals(12.34567)).toBe("12,3457")
    expect(fmtMaxDecimals(0.5, 1)).toBe("0,5")
  })
  test("capitalize", () => {
    expect(capitalize("gold")).toBe("Gold")
    expect(capitalize("")).toBe("")
    expect(capitalize("oz")).toBe("Oz")
  })
})

describe("fmtSignedAmount", () => {
  test("debits are negative and credits positive, whatever the stored amount's sign", () => {
    expect(norm(fmtSignedAmount("12.50", "DBIT", "EUR"))).toBe("€ -12,50")
    expect(norm(fmtSignedAmount("12.50", "CRDT", "EUR"))).toBe("€ +12,50")
  })
  test("thousands use dots and decimals commas (nl-NL), other currencies work", () => {
    expect(norm(fmtSignedAmount("1234.5", "CRDT", "EUR"))).toBe("€ +1.234,50")
    expect(norm(fmtSignedAmount("5", "DBIT", "USD"))).toContain("US$")
  })
  test("the locale can be overridden", () => {
    expect(fmtSignedAmount("1234.5", "CRDT", "USD", "en-US")).toBe("+$1,234.50")
  })
  test("zero is shown with a plus sign", () => {
    expect(norm(fmtSignedAmount("0", "CRDT", "EUR"))).toBe("€ +0,00")
  })
})
