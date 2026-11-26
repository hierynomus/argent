import { describe, expect, test } from "vitest"
import { sliceRange } from "./balanceRange"

const points = [
  { date: "2025-01-10", balance: "100.00" },
  { date: "2025-12-20", balance: "150.00" },
  { date: "2026-02-10", balance: "90.00" },
  { date: "2026-03-31", balance: "90.00" },
]

describe("sliceRange", () => {
  test("all keeps everything", () => expect(sliceRange(points, "max")).toEqual(points))

  test("starts on the first day of the range at the balance it had then", () => {
    expect(sliceRange(points, "1m")).toEqual([{ date: "2026-02-28", balance: "90.00" }, { date: "2026-03-31", balance: "90.00" }])
    expect(sliceRange(points, "3m")).toEqual([
      { date: "2025-12-31", balance: "150.00" },
      { date: "2026-02-10", balance: "90.00" },
      { date: "2026-03-31", balance: "90.00" },
    ])
  })

  test("a range longer than the history is the whole history", () => {
    expect(sliceRange(points, "1y")).toEqual([{ date: "2025-03-31", balance: "100.00" }, ...points.slice(1)])
    expect(sliceRange(points.slice(1), "1y")).toEqual(points.slice(1))
  })

  test("no points, no slice", () => expect(sliceRange([], "3m")).toEqual([]))
})
