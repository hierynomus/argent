import { describe, expect, test } from "bun:test"
import { createDebtPartSchema, createStockTradeSchema } from "@argent/shared"
import { validate } from "./validate"

describe("validate", () => {
  test("returns the parsed value when valid (normalised by the schema)", () => {
    const r = validate(createStockTradeSchema, { tradeDate: "2024-01-01", type: "buy", symbol: " aapl ", quantity: "1", amount: "10" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.symbol).toBe("AAPL")
  })

  test("maps issues to the field they belong to", () => {
    const r = validate(createStockTradeSchema, { tradeDate: "nope", type: "buy", symbol: "A", quantity: "0", amount: "10" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["quantity", "tradeDate"])
      expect(r.errors.quantity).toBe("quantity must be greater than 0")
      expect(r.errors.tradeDate).toContain("tradeDate must be a date")
    }
  })

  test("cross-field rules land on the field the schema names", () => {
    const r = validate(createDebtPartSchema, {
      name: "p", type: "annuity", principal: "1000", annualInterestRate: "0.03", startDate: "2030-01-01", endDate: "2020-01-01",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual({ endDate: "endDate must be after startDate" })
  })

  test("keeps only the first message per field", () => {
    const r = validate(createStockTradeSchema, { tradeDate: "2024-01-01", type: "buy", symbol: "A", quantity: "", amount: "10" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(typeof r.errors.quantity).toBe("string")
  })

  test("a missing field reports that it is required", () => {
    const r = validate(createStockTradeSchema, {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      for (const f of ["tradeDate", "type", "symbol", "quantity", "amount"]) expect(r.errors[f]).toBeDefined()
    }
  })
})
