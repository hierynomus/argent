import { describe, expect, test } from "bun:test"
import { addDays, computeIntervalLabel, computeStatsFromTransactions, daysBetween, median } from "./subscriptionDetector"

describe("median", () => {
  test("empty → 0", () => expect(median([])).toBe(0))
  test("odd length", () => expect(median([5, 1, 3])).toBe(3))
  test("even length averages the middle two", () => expect(median([1, 2, 3, 10])).toBe(2.5))
  test("does not mutate input", () => {
    const v = [3, 1, 2]
    median(v)
    expect(v).toEqual([3, 1, 2])
  })
})

describe("computeIntervalLabel", () => {
  test.each([
    [7, "weekly"], [14, "bi-weekly"], [30, "monthly"], [31, "monthly"],
    [91, "quarterly"], [365, "yearly"], [50, "custom"], [2, "custom"],
  ])("%d days → %s", (days, label) => expect(computeIntervalLabel(days)).toBe(label))
})

describe("date helpers", () => {
  test("daysBetween", () => {
    expect(daysBetween("2024-01-01", "2024-01-31")).toBe(30)
    expect(daysBetween("2024-02-01", "2024-03-01")).toBe(29) // leap year
    expect(daysBetween("2024-01-31", "2024-01-01")).toBe(-30)
  })
  test("addDays crosses month and year boundaries", () => {
    expect(addDays("2024-01-30", 5)).toBe("2024-02-04")
    expect(addDays("2023-12-30", 5)).toBe("2024-01-04")
  })
})

describe("computeStatsFromTransactions", () => {
  const tx = (bookingDate: string, amount: string, counterpartyName: string | null = null) =>
    ({ bookingDate, amount, currency: "EUR", counterpartyName })

  test("monthly series", () => {
    const today = new Date().toISOString().slice(0, 10)
    const s = computeStatsFromTransactions([
      tx(addDays(today, -60), "9.99", "Netflix"),
      tx(addDays(today, -30), "9.99"),
      tx(today, "10.99"),
    ])
    expect(s.medianAmount).toBe("9.99")
    expect(s.intervalDays).toBe(30)
    expect(s.intervalLabel).toBe("monthly")
    expect(s.lastSeenDate).toBe(today)
    expect(s.nextExpectedDate).toBe(addDays(today, 30))
    expect(s.isActive).toBe(true)
    expect(s.counterpartyName).toBe("Netflix")
    expect(s.currency).toBe("EUR")
  })

  test("stale subscription is inactive (>2× interval since last seen)", () => {
    const s = computeStatsFromTransactions([tx("2020-01-01", "5"), tx("2020-02-01", "5")])
    expect(s.isActive).toBe(false)
  })

  test("single transaction has no interval", () => {
    const s = computeStatsFromTransactions([tx("2024-01-01", "5")])
    expect(s.intervalDays).toBeNull()
    expect(s.intervalLabel).toBeNull()
    expect(s.nextExpectedDate).toBeNull()
    expect(s.isActive).toBe(true)
  })
})
