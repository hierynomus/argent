import { describe, expect, test } from "bun:test"
import { currentPriceOf, nextVestingDate, valuePerOption, vestedOptions, type GrantInput } from "./equity"

const grant = (over: Partial<GrantInput> = {}): GrantInput => ({ options: 4800, vestingType: "time", vestStart: "2022-01-01", cliffMonths: 12, vestMonths: 48, ...over })

describe("vestedOptions", () => {
  test("nothing before the cliff, the accumulated part at the cliff, then monthly", () => {
    expect(vestedOptions(grant(), "2022-12-31")).toBe(0) // 11 months
    expect(vestedOptions(grant(), "2023-01-01")).toBe(1200) // 12/48 released at the cliff
    expect(vestedOptions(grant(), "2023-02-01")).toBe(1300) // + 1/48 a month
    expect(vestedOptions(grant(), "2024-07-15")).toBe(3000) // 30 of 48 months
  })

  test("fully vested after the vesting period, and stays so", () => {
    expect(vestedOptions(grant(), "2026-01-01")).toBe(4800)
    expect(vestedOptions(grant(), "2040-01-01")).toBe(4800)
  })

  test("no cliff: vesting starts at once; a start in the future vests nothing", () => {
    expect(vestedOptions(grant({ cliffMonths: 0 }), "2022-03-01")).toBe(200)
    expect(vestedOptions(grant({ vestStart: "2099-01-01" }), "2024-01-01")).toBe(0)
  })

  test("the day of the month counts: a month is only complete once its day is reached", () => {
    const g = grant({ vestStart: "2022-01-15", cliffMonths: 0 })
    expect(vestedOptions(g, "2022-02-14")).toBe(0)
    expect(vestedOptions(g, "2022-02-15")).toBe(100)
  })

  test("fractions are rounded down to 1/100 of an option", () => {
    expect(vestedOptions(grant({ options: 100, vestMonths: 36, cliffMonths: 0 }), "2022-01-01")).toBe(0)
    expect(vestedOptions(grant({ options: 100, vestMonths: 36, cliffMonths: 0 }), "2022-02-01")).toBe(2.77) // 100/36 = 2.777…
  })

  test("rounding is exact: values floats get wrong (0.29 × 100 = 28.999…) are not truncated a cent short", () => {
    const full = { vestStart: "2022-01-01", cliffMonths: 0, vestMonths: 12 }
    expect(vestedOptions(grant({ ...full, options: 1.15 }), "2023-01-01")).toBe(1.15) // 1.15 × 100 = 114.99999999999999
    expect(vestedOptions(grant({ ...full, options: 0.29 }), "2023-01-01")).toBe(0.29)
    expect(vestedOptions(grant({ ...full, options: 4.35 }), "2023-01-01")).toBe(4.35) // 4.35 × 100 = 434.99999999999994
    expect(vestedOptions(grant({ ...full, options: 12.01 }), "2022-07-01")).toBe(6.00) // 6 months of 12.01 = 6.005, rounded down
  })

  test("exit-only grants never vest over time", () => {
    expect(vestedOptions(grant({ vestingType: "exit", vestStart: null, vestMonths: null, cliffMonths: 0 }), "2030-01-01")).toBe(0)
  })
})

describe("nextVestingDate", () => {
  test("the cliff first, then each month, then nothing once fully vested", () => {
    expect(nextVestingDate(grant(), "2022-06-01")).toBe("2023-01-01")
    expect(nextVestingDate(grant(), "2023-01-01")).toBe("2023-02-01")
    expect(nextVestingDate(grant(), "2023-01-20")).toBe("2023-02-01")
    expect(nextVestingDate(grant(), "2025-12-31")).toBe("2026-01-01")
    expect(nextVestingDate(grant(), "2026-01-01")).toBeNull()
  })
  test("before the start: the cliff, or the first month without one", () => {
    expect(nextVestingDate(grant({ vestStart: "2099-01-01" }), "2024-01-01")).toBe("2100-01-01")
    expect(nextVestingDate(grant({ vestStart: "2099-01-01", cliffMonths: 0 }), "2024-01-01")).toBe("2099-02-01")
  })
  test("exit-only grants have none", () => expect(nextVestingDate(grant({ vestingType: "exit", vestStart: null, vestMonths: null }), "2024-01-01")).toBeNull())
})

describe("currentPriceOf / valuePerOption", () => {
  const p = (priceDate: string, price: string) => ({ priceDate, price })
  test("the latest price on or before today, flat until the next; future prices wait", () => {
    const prices = [p("2022-01-01", "5"), p("2023-06-01", "12"), p("2099-01-01", "100")]
    expect(currentPriceOf(prices, "2023-05-31")).toEqual({ price: 5, date: "2022-01-01" })
    expect(currentPriceOf(prices, "2023-06-01")).toEqual({ price: 12, date: "2023-06-01" })
    expect(currentPriceOf(prices, "2030-01-01")).toEqual({ price: 12, date: "2023-06-01" })
    expect(currentPriceOf([], "2030-01-01")).toEqual({ price: null, date: null })
    expect(currentPriceOf([p("2099-01-01", "1")], "2030-01-01").price).toBeNull()
  })
  test("an option is worth the price above the strike, never negative; unknown without a price", () => {
    expect(valuePerOption(12, 2)).toBe(10)
    expect(valuePerOption(1.5, 2)).toBe(0) // under water
    expect(valuePerOption(null, 2)).toBeNull()
  })
})
