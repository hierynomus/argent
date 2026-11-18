import { describe, expect, test } from "vitest"
import { addMonths, monthsBetween } from "./dates"

describe("addMonths", () => {
  test("keeps the day of the month", () => {
    expect(addMonths("2024-11-28", 37)).toBe("2027-12-28")
    expect(addMonths("2024-01-01", 240)).toBe("2044-01-01")
  })
  test("crosses year boundaries both ways", () => {
    expect(addMonths("2024-11-15", 2)).toBe("2025-01-15")
    expect(addMonths("2024-01-15", -2)).toBe("2023-11-15")
  })
  test("clamps to the last day of shorter months", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29") // leap year
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28")
    expect(addMonths("2024-03-31", 1)).toBe("2024-04-30")
  })
  test("zero months is the same date", () => expect(addMonths("2024-05-17", 0)).toBe("2024-05-17"))
  test("invalid input gives an empty string", () => {
    expect(addMonths("", 3)).toBe("")
    expect(addMonths("2024-05", 3)).toBe("")
    expect(addMonths("2024-05-17", 1.5)).toBe("")
    expect(addMonths("2024-05-17", NaN)).toBe("")
  })
})

describe("monthsBetween", () => {
  test("counts calendar months and ignores the day", () => {
    expect(monthsBetween("2024-11-28", "2027-12-28")).toBe(37)
    expect(monthsBetween("2020-01-15", "2030-01-01")).toBe(120)
  })
  test("is never negative", () => expect(monthsBetween("2030-01-01", "2020-01-01")).toBe(0))
  test("round-trips with addMonths", () => expect(monthsBetween("2024-03-09", addMonths("2024-03-09", 45))).toBe(45))
})
