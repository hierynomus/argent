import { describe, expect, test } from "vitest"
import { fmtMonths, sumImpacts } from "./extraSavings"

const impact = (over = {}) => ({ count: 1, totalExtra: 1000.1, interestWithExtra: 0, interestWithoutExtra: 0, interestSaved: 200.2, monthsSaved: 3, endDate: "", endDateWithoutExtra: "", ...over })

describe("extra payment savings", () => {
  test("months read as years and months", () => {
    expect(fmtMonths(1)).toBe("1 month")
    expect(fmtMonths(11)).toBe("11 months")
    expect(fmtMonths(12)).toBe("1 year")
    expect(fmtMonths(26)).toBe("2 years 2 months")
  })

  test("sums the parts that have extra payments, in whole cents", () => {
    expect(sumImpacts([null, undefined])).toBeNull()
    expect(sumImpacts([impact(), null, impact({ count: 2, totalExtra: 0.2, interestSaved: 0.1 })])).toEqual({ count: 3, totalExtra: 1000.3, interestSaved: 200.3 })
  })
})
