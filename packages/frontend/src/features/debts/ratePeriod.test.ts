import { describe, expect, test } from "vitest"
import { rateChangeSoon } from "./ratePeriod"

const change = (effectiveDate: string) => ({ nextRateChange: { effectiveDate } })

describe("rateChangeSoon: highlight a part whose fixed-rate period ends within three months", () => {
  const today = "2026-11-19"

  test("within three months: yes (today and the last day included)", () => {
    expect(rateChangeSoon(change("2026-11-19"), today)).toBe(true)
    expect(rateChangeSoon(change("2027-01-01"), today)).toBe(true)
    expect(rateChangeSoon(change("2027-02-19"), today)).toBe(true) // exactly three months
  })

  test("further away: no", () => {
    expect(rateChangeSoon(change("2027-02-20"), today)).toBe(false)
    expect(rateChangeSoon(change("2030-01-01"), today)).toBe(false)
  })

  test("already past, nothing known, or a closed part: no", () => {
    expect(rateChangeSoon(change("2026-11-18"), today)).toBe(false)
    expect(rateChangeSoon({ nextRateChange: null }, today)).toBe(false)
    expect(rateChangeSoon({}, today)).toBe(false)
    expect(rateChangeSoon({ ...change("2027-01-01"), closedOn: "2026-12-01" }, today)).toBe(false)
  })

  test("counts from the end of the month correctly (31 Nov does not exist)", () => {
    expect(rateChangeSoon(change("2026-02-28"), "2025-11-30")).toBe(true) // 30 Nov + 3 months = 28 Feb
    expect(rateChangeSoon(change("2026-03-01"), "2025-11-30")).toBe(false)
  })
})
