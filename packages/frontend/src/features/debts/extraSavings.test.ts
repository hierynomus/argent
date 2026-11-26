import { describe, expect, test } from "vitest"
import { fmtMonths, sumImpacts } from "./extraSavings"

const impact = (over = {}) => ({ count: 1, totalExtra: 1000.1, interestWithExtra: 10, interestWithoutExtra: 30, interestPaidToDate: 4, interestPaidToDateWithoutExtra: 5, interestSaved: 200.2, monthsSaved: 3, endDate: "2040-01-01", endDateWithoutExtra: "2041-01-01", ...over })

describe("extra payment savings", () => {
  test("months read as years and months", () => {
    expect(fmtMonths(1)).toBe("1 month")
    expect(fmtMonths(11)).toBe("11 months")
    expect(fmtMonths(12)).toBe("1 year")
    expect(fmtMonths(26)).toBe("2 years 2 months")
  })

  test("sums the parts that have extra payments, in whole cents; the debt ends with its last part", () => {
    expect(sumImpacts([null, undefined])).toBeNull()
    const total = sumImpacts([impact(), null, impact({ count: 2, totalExtra: 0.2, interestSaved: 0.1, monthsSaved: 9, endDate: "2045-06-01", endDateWithoutExtra: "2048-06-01" })])!
    expect(total).toMatchObject({ count: 3, totalExtra: 1000.3, interestSaved: 200.3, interestWithExtra: 20, interestPaidToDate: 8, monthsSaved: 9, endDate: "2045-06-01", endDateWithoutExtra: "2048-06-01" })
  })
})
