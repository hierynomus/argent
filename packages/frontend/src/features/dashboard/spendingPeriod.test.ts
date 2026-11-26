import { describe, expect, test } from "vitest"
import { monthRange } from "./spendingPeriod"

describe("monthRange", () => {
  test("this month and the ones before, across a year end and a leap day", () => {
    expect(monthRange("2026-11-26", 0)).toMatchObject({ key: "2026-11", from: "2026-11-01", to: "2026-11-30" })
    expect(monthRange("2026-11-26", 1)).toMatchObject({ key: "2026-10", from: "2026-10-01", to: "2026-10-31" })
    expect(monthRange("2026-01-15", 1)).toMatchObject({ key: "2025-12", to: "2025-12-31" })
    expect(monthRange("2026-03-31", 1)).toMatchObject({ key: "2026-02", to: "2026-02-28" })
    expect(monthRange("2024-03-31", 1)).toMatchObject({ to: "2024-02-29" })
    expect(monthRange("2026-02-01", 14)).toMatchObject({ key: "2024-12" })
  })
})
