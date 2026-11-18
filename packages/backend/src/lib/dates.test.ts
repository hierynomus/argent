import { describe, expect, test } from "bun:test"
import { addDays, addMonths, completedMonths, daysBetween, monthsBetween, todayIso } from "./dates"

describe("addMonths", () => {
  test("keeps the day and crosses years", () => {
    expect(addMonths("2024-11-15", 2)).toBe("2025-01-15")
    expect(addMonths("2021-03-01", 48)).toBe("2025-03-01")
  })
  test("clamps to the last day of shorter months", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29")
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28")
  })
})

describe("completedMonths", () => {
  test("counts months once their day has been reached", () => {
    expect(completedMonths("2024-01-15", "2024-01-14")).toBe(0)
    expect(completedMonths("2024-01-15", "2024-02-14")).toBe(0)
    expect(completedMonths("2024-01-15", "2024-02-15")).toBe(1)
    expect(completedMonths("2024-01-15", "2025-01-15")).toBe(12)
  })
  test("0 before the start", () => expect(completedMonths("2024-06-01", "2024-05-31")).toBe(0))
  test("a start on the 31st counts on the last day of shorter months", () => {
    expect(completedMonths("2024-01-31", "2024-02-28")).toBe(0) // leap year: the 29th is the month's end
    expect(completedMonths("2024-01-31", "2024-02-29")).toBe(1)
    expect(completedMonths("2023-01-31", "2023-02-28")).toBe(1)
  })
})

describe("addDays / daysBetween are plain calendar arithmetic (no daylight-saving surprises)", () => {
  test("adds days across month and year ends", () => {
    expect(addDays("2024-01-30", 3)).toBe("2024-02-02")
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01")
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29")
    expect(addDays("2024-05-17", 0)).toBe("2024-05-17")
  })

  test("across the European and US daylight-saving changes a day is still a day (this was a day early in Europe/Amsterdam)", () => {
    expect(addDays("2024-03-30", 2)).toBe("2024-04-01") // clocks go forward on 31 March
    expect(addDays("2024-10-26", 2)).toBe("2024-10-28") // and back on 27 October
    expect(addDays("2024-03-09", 2)).toBe("2024-03-11") // US spring forward
    expect(addDays("2024-11-02", 2)).toBe("2024-11-04") // US fall back
    for (const start of ["2024-03-29", "2024-03-30", "2024-03-31", "2024-10-25", "2024-10-26", "2024-10-27"]) {
      for (let n = -40; n <= 40; n++) expect(daysBetween(start, addDays(start, n))).toBe(n) // round trip, whatever the zone
    }
  })

  test("daysBetween counts whole days, signed", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2) // leap year
    expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1)
    expect(daysBetween("2024-06-10", "2024-06-01")).toBe(-9)
    expect(daysBetween("2024-06-01", "2024-06-01")).toBe(0)
    expect(daysBetween("2020-01-01", "2030-01-01")).toBe(3653)
  })
})

describe("monthsBetween and todayIso", () => {
  test("monthsBetween ignores the day and never goes below zero", () => {
    expect(monthsBetween("2024-11-28", "2027-12-28")).toBe(37)
    expect(monthsBetween("2020-01-31", "2020-02-01")).toBe(1)
    expect(monthsBetween("2030-01-01", "2020-01-01")).toBe(0)
  })

  test("todayIso is the UTC calendar date of the instant, not the server's local date", () => {
    expect(todayIso(new Date("2024-06-01T23:30:00Z"))).toBe("2024-06-01")
    expect(todayIso(new Date("2024-06-02T00:30:00Z"))).toBe("2024-06-02")
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
