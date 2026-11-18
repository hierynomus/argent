import { describe, expect, test } from "bun:test"
import { addMonths, completedMonths } from "./dates"

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
