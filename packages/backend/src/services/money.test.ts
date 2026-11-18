import { describe, expect, test } from "bun:test"
import { DUST_QUANTITY, Decimal, cents, exceedsBalance, isOpenQuantity } from "./money"

describe("cents: round half up in decimal, not in binary", () => {
  test("values that binary floats get wrong", () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1) // what the old rounding gave
    expect(cents(1.005)).toBe(1.01)
    expect(cents(2.675)).toBe(2.68)
    expect(cents(1.255)).toBe(1.26)
    expect(cents(8.345)).toBe(8.35)
  })

  test("ordinary rounding, negative numbers (half away from zero) and exact values", () => {
    expect(cents(1.004)).toBe(1)
    expect(cents(1.006)).toBe(1.01)
    expect(cents(-1.005)).toBe(-1.01)
    expect(cents(-1.004)).toBe(-1)
    expect(cents(0.1 + 0.2)).toBe(0.3) // 0.30000000000000004
    expect(cents(12.5)).toBe(12.5)
    expect(cents("33.333333")).toBe(33.33)
    expect(cents(0)).toBe(0)
  })
})

describe("quantities", () => {
  test("dust: a fully sold position (even with float residue) counts as closed", () => {
    expect(isOpenQuantity(0)).toBe(false)
    expect(isOpenQuantity(5.55e-17)).toBe(false) // 0.1 + 0.2 - 0.3
    expect(isOpenQuantity(DUST_QUANTITY)).toBe(false)
    expect(isOpenQuantity(0.00000001)).toBe(true) // one satoshi is a position
  })

  test("exceedsBalance is exact to the 8 decimals of the columns, with no tolerance", () => {
    expect(exceedsBalance("1", 1)).toBe(false) // selling exactly what is held
    expect(exceedsBalance("1.00000001", 1)).toBe(true) // one unit more is too much
    expect(exceedsBalance("0.3", 0.1 + 0.2)).toBe(false) // 0.30000000000000004 in floats, exactly 0.3 held
    expect(exceedsBalance("0.30000001", 0.1 + 0.2)).toBe(true)
    expect(exceedsBalance("0.00000001", 0)).toBe(true)
  })

  test("Decimal is exact where floats are not", () => {
    expect(new Decimal("0.1").plus("0.2").toString()).toBe("0.3")
    expect(0.1 + 0.2).not.toBe(0.3)
  })
})
