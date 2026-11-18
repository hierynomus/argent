import { describe, expect, test } from "bun:test"
import {
  addMemberSchema, createCategorySchema, createCryptoTradeSchema, createDebtPartSchema, createDebtSchema,
  createDebtExtraPaymentSchema, createMetalLotSchema, createMetalSaleSchema, createPortfolioSchema,
  createStockDividendSchema, createStockTradeSchema, createSubscriptionSchema, decimalString, isoDate,
  linkTransferSchema, nonNegativeDecimalString, positiveDecimalString, setAccountOwnerSchema,
  updateAccountSchema, updateDebtPartSchema, updateDebtSchema, updateMeSchema, updatePortfolioSchema,
  updateSubscriptionSchema, updateTransactionSchema,
  createPropertySchema, updatePropertySchema, createPropertyValuationSchema, setPropertyLinksSchema,
} from "./schemas"
import type { z } from "zod"

const UUID = "123e4567-e89b-42d3-a456-426614174000"

/** Returns the issue messages, or [] if the value is valid. */
const errors = (schema: z.ZodType, value: unknown): string[] => {
  const r = schema.safeParse(value)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}
const ok = (schema: z.ZodType, value: unknown) => expect(errors(schema, value)).toEqual([])
const bad = (schema: z.ZodType, value: unknown, message?: string) => {
  const e = errors(schema, value)
  expect(e.length).toBeGreaterThan(0)
  if (message) expect(e.join("; ")).toContain(message)
}

describe("decimal strings", () => {
  test.each(["0", "1", "12.5", "-3", "-0.01", "1000000.123456", " 7 "])("decimalString accepts %p", (v) => ok(decimalString("x"), v))
  test.each(["", "abc", "1,5", "1.", ".5", "1e3", "--1", "1.2.3", "Infinity", "NaN"])("decimalString rejects %p", (v) => bad(decimalString("x"), v))
  test("rejects non-strings", () => { bad(decimalString("x"), 5); bad(decimalString("x"), null); bad(decimalString("x"), undefined, "x is required") })

  test("positive: 0 and negatives are rejected", () => {
    ok(positiveDecimalString("amount"), "0.01")
    bad(positiveDecimalString("amount"), "0", "amount must be greater than 0")
    bad(positiveDecimalString("amount"), "-1")
  })
  test("non-negative: 0 is allowed, negatives are not", () => {
    ok(nonNegativeDecimalString("rate"), "0")
    ok(nonNegativeDecimalString("rate"), "0.05")
    bad(nonNegativeDecimalString("rate"), "-0.01", "rate must not be negative")
  })
  test("trims whitespace", () => {
    expect(decimalString("x").parse("  12.50 ")).toBe("12.50")
  })
})

describe("isoDate", () => {
  test.each(["2024-01-01", "2024-02-29", "1999-12-31"])("accepts %p", (v) => ok(isoDate("d"), v))
  test.each(["2023-02-29", "2024-13-01", "2024-00-10", "2024-04-31", "24-01-01", "2024/01/01", "01-01-2024", "2024-1-1", "", "today"])("rejects %p", (v) => bad(isoDate("d"), v))
  test("messages name the field", () => {
    bad(isoDate("tradeDate"), "nope", "tradeDate must be a date")
    bad(isoDate("tradeDate"), "2024-02-30", "tradeDate is not a valid date")
    bad(isoDate("tradeDate"), undefined, "tradeDate is required")
  })
})

describe("members", () => {
  test("valid", () => { ok(addMemberSchema, { groupName: "family" }); ok(addMemberSchema, { groupName: "family", role: "editor" }) })
  test("groupName is trimmed and required", () => {
    expect(addMemberSchema.parse({ groupName: "  family " }).groupName).toBe("family")
    bad(addMemberSchema, { groupName: "   " }, "groupName is required")
    bad(addMemberSchema, {}, "groupName is required")
  })
  test("role must be viewer or editor", () => {
    bad(addMemberSchema, { groupName: "g", role: "owner" }, "role must be viewer or editor")
  })
})

describe("portfolios", () => {
  test("create: name required, currency EUR|USD, broker optional", () => {
    ok(createPortfolioSchema, { name: "Main" })
    ok(createPortfolioSchema, { name: "Main", currency: "USD", broker: "DEGIRO" })
    bad(createPortfolioSchema, { name: " " }, "name is required")
    bad(createPortfolioSchema, { name: "x", currency: "GBP" }, "currency must be EUR or USD")
    expect(createPortfolioSchema.parse({ name: "  Main  " }).name).toBe("Main")
  })
  test("update: every field optional, but if present must be valid", () => {
    ok(updatePortfolioSchema, {})
    ok(updatePortfolioSchema, { broker: null })
    bad(updatePortfolioSchema, { name: "" }, "name must not be empty")
    bad(updatePortfolioSchema, { currency: "JPY" })
  })
})

describe("crypto trades", () => {
  const valid = { tradeDate: "2024-01-01", fromSymbol: "eur", fromAmount: "100", toSymbol: "btc", toAmount: "0.002" }
  test("valid, and symbols are upper-cased/trimmed", () => {
    const parsed = createCryptoTradeSchema.parse({ ...valid, fromSymbol: " eur ", toSymbol: "btc" })
    expect([parsed.fromSymbol, parsed.toSymbol]).toEqual(["EUR", "BTC"])
  })
  test("same from/to symbol is rejected (case-insensitively)", () => {
    bad(createCryptoTradeSchema, { ...valid, fromSymbol: "btc", toSymbol: "BTC" }, "fromSymbol and toSymbol must differ")
  })
  test("amounts must be positive decimals", () => {
    bad(createCryptoTradeSchema, { ...valid, fromAmount: "0" })
    bad(createCryptoTradeSchema, { ...valid, toAmount: "-1" })
    bad(createCryptoTradeSchema, { ...valid, toAmount: "lots" })
  })
  test("optional base amount may be zero but not negative", () => {
    ok(createCryptoTradeSchema, { ...valid, baseCurrencyAmount: "0" })
    bad(createCryptoTradeSchema, { ...valid, baseCurrencyAmount: "-5" })
  })
  test("reports every missing field at once", () => {
    const r = createCryptoTradeSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(["fromAmount", "fromSymbol", "tradeDate", "toAmount", "toSymbol"].sort())
  })
})

describe("stock trades & dividends", () => {
  const trade = { tradeDate: "2024-01-01", type: "buy", symbol: "aapl", quantity: "10", amount: "1500" }
  test("valid trade", () => { expect(createStockTradeSchema.parse(trade).symbol).toBe("AAPL") })
  test("type must be buy or sell", () => { bad(createStockTradeSchema, { ...trade, type: "swap" }, "type must be buy or sell") })
  test("quantity and amount must be > 0", () => {
    bad(createStockTradeSchema, { ...trade, quantity: "0" })
    bad(createStockTradeSchema, { ...trade, amount: "0" })
  })
  test("dividend", () => {
    ok(createStockDividendSchema, { symbol: "AAPL", paymentDate: "2024-03-01", amount: "12.5" })
    bad(createStockDividendSchema, { symbol: "AAPL", paymentDate: "2024-03-01", amount: "0" })
    bad(createStockDividendSchema, { symbol: "", paymentDate: "2024-03-01", amount: "1" })
  })
})

describe("metals", () => {
  const lot = { purchaseDate: "2024-01-01", metal: "gold", weightPerPiece: "31.1", pricePerPiece: "1800" }
  test("lot: valid with defaults omitted", () => { ok(createMetalLotSchema, lot) })
  test("unit must be g or oz", () => {
    ok(createMetalLotSchema, { ...lot, unit: "oz" })
    bad(createMetalLotSchema, { ...lot, unit: "lb" }, "unit must be g or oz")
  })
  test("weight > 0, price >= 0, quantity > 0", () => {
    bad(createMetalLotSchema, { ...lot, weightPerPiece: "0" })
    ok(createMetalLotSchema, { ...lot, pricePerPiece: "0" })
    bad(createMetalLotSchema, { ...lot, pricePerPiece: "-1" })
    bad(createMetalLotSchema, { ...lot, quantity: 0 })
    bad(createMetalLotSchema, { ...lot, quantity: "2" }) // number expected
  })
  test("sale", () => {
    ok(createMetalSaleSchema, { saleDate: "2024-02-01", quantitySold: 1, totalReceived: "1900" })
    bad(createMetalSaleSchema, { saleDate: "2024-02-01", quantitySold: 0, totalReceived: "1" })
    bad(createMetalSaleSchema, { saleDate: "2024-02-01", quantitySold: 1 }, "totalReceived is required")
    bad(createMetalSaleSchema, { saleDate: "2024-02-01", totalReceived: "1" }, "quantitySold is required")
  })
})

describe("mortgages & loans", () => {
  const part = { name: "Part", type: "annuity", principal: "100000", annualInterestRate: "0.04", startDate: "2020-01-01", endDate: "2050-01-01" }
  test("debt create/update", () => {
    ok(createDebtSchema, { name: "House" }); ok(createDebtSchema, { name: "House", currency: "USD" })
    bad(createDebtSchema, { name: "" }); bad(createDebtSchema, { name: "x", currency: "CHF" })
    ok(updateDebtSchema, {}); bad(updateDebtSchema, { name: " " })
  })
  test("part: valid", () => { ok(createDebtPartSchema, part) })
  test.each(["linear", "annuity", "interest_only"])("part type %s is accepted", (type) => ok(createDebtPartSchema, { ...part, type }))
  test("part type: anything else is rejected with a helpful message", () => {
    bad(createDebtPartSchema, { ...part, type: "balloon" }, "type must be linear, annuity, or interest_only")
  })
  test("endDate must be after startDate (also not equal)", () => {
    bad(createDebtPartSchema, { ...part, startDate: "2030-01-01", endDate: "2020-01-01" }, "endDate must be after startDate")
    bad(createDebtPartSchema, { ...part, startDate: "2030-01-01", endDate: "2030-01-01" }, "endDate must be after startDate")
  })
  test("principal > 0; rate >= 0 (0% is allowed)", () => {
    bad(createDebtPartSchema, { ...part, principal: "0" })
    ok(createDebtPartSchema, { ...part, annualInterestRate: "0" })
    bad(createDebtPartSchema, { ...part, annualInterestRate: "-0.01" })
  })
  test("part update: partial", () => {
    ok(createDebtPartSchema, { ...part, rateType: "effective" }); ok(createDebtPartSchema, { ...part, rateType: "nominal" })
    bad(createDebtPartSchema, { ...part, rateType: "weekly" })
    ok(updateDebtPartSchema, { rateType: "effective" }); bad(updateDebtPartSchema, { rateType: "x" })
    ok(updateDebtPartSchema, {}); ok(updateDebtPartSchema, { endDate: "2040-01-01" }); ok(updateDebtPartSchema, { annualInterestRate: "0.03" })
    bad(updateDebtPartSchema, { endDate: "soon" })
  })
  test("extra payment", () => {
    ok(createDebtExtraPaymentSchema, { paymentDate: "2024-01-01", amount: "500", notes: "bonus" })
    bad(createDebtExtraPaymentSchema, { paymentDate: "2024-01-01", amount: "0" })
    bad(createDebtExtraPaymentSchema, { amount: "5" }, "paymentDate is required")
  })
})

describe("accounts, transactions, categories, subscriptions, profile, admin", () => {
  test("updateAccount: all optional; validates what is present", () => {
    ok(updateAccountSchema, {})
    ok(updateAccountSchema, { name: "x", type: "savings", openingBalance: "-10.5", openingBalanceDate: "2024-01-01" })
    ok(updateAccountSchema, { openingBalanceDate: null })
    bad(updateAccountSchema, { type: "current" }); bad(updateAccountSchema, { openingBalance: "ten" }); bad(updateAccountSchema, { openingBalanceDate: "2024-02-30" })
  })
  test("updateTransaction: categoryId is a UUID or null (clearing)", () => {
    ok(updateTransactionSchema, { categoryId: UUID }); ok(updateTransactionSchema, { categoryId: null })
    bad(updateTransactionSchema, { categoryId: "x" }); bad(updateTransactionSchema, {})
  })
  test("linkTransfer", () => { ok(linkTransferSchema, { peerId: UUID }); bad(linkTransferSchema, { peerId: "x" }); bad(linkTransferSchema, {}) })
  test("category", () => {
    ok(createCategorySchema, { name: "Food" }); ok(createCategorySchema, { name: "Food", color: "#fff", parentId: UUID })
    bad(createCategorySchema, { name: " " }); bad(createCategorySchema, { name: "x", parentId: "nope" })
  })
  test("subscription create/update", () => {
    ok(createSubscriptionSchema, { accountId: UUID, counterpartyIban: "NL05TEST0417164300" })
    bad(createSubscriptionSchema, { accountId: "x", counterpartyIban: "NL1" }); bad(createSubscriptionSchema, { accountId: UUID, counterpartyIban: " " })
    ok(updateSubscriptionSchema, { status: "confirmed" }); ok(updateSubscriptionSchema, { status: "dismissed", isActive: false })
    bad(updateSubscriptionSchema, { status: "candidate" }) // not settable through the API
    bad(updateSubscriptionSchema, { isActive: "yes" })
  })
  test("profile theme", () => {
    for (const theme of ["light", "dark", "system"]) ok(updateMeSchema, { theme })
    ok(updateMeSchema, {})
    bad(updateMeSchema, { theme: "neon" }, "Invalid theme value")
  })
  test("admin: owner may be a string or null, but must be present", () => {
    ok(setAccountOwnerSchema, { ownerSub: "abc" }); ok(setAccountOwnerSchema, { ownerSub: null })
    bad(setAccountOwnerSchema, {}); bad(setAccountOwnerSchema, { ownerSub: "" })
  })
})

describe("unknown fields are ignored (not stored), not rejected", () => {
  test("extra properties are stripped from the parsed value", () => {
    const parsed = createCategorySchema.parse({ name: "Food", isAdmin: true, __proto__x: 1 })
    expect(Object.keys(parsed)).toEqual(["name"])
  })
})

describe("property schemas", () => {
  test("create: only a name is required; type, currency, purchase and current value are optional and checked", () => {
    ok(createPropertySchema, { name: "Our house" })
    ok(createPropertySchema, { name: "Flat", type: "apartment", currency: "USD", purchasePrice: "250000", purchaseDate: "2021-03-01", currentValue: "300000.50" })
    bad(createPropertySchema, { name: " " }, "name is required")
    bad(createPropertySchema, { name: "x", type: "castle" }, "type must be one of")
    bad(createPropertySchema, { name: "x", currency: "GBP" })
    bad(createPropertySchema, { name: "x", purchasePrice: "0" }, "purchasePrice must be greater than 0")
    bad(createPropertySchema, { name: "x", purchaseDate: "2021-02-31" }, "not a valid date")
    bad(createPropertySchema, { name: "x", currentValue: "abc" })
  })

  test("update: every field optional; the purchase can be cleared with null", () => {
    ok(updatePropertySchema, {})
    ok(updatePropertySchema, { name: "New", type: "land", purchasePrice: null, purchaseDate: null })
    bad(updatePropertySchema, { name: "" }, "name must not be empty")
    bad(updatePropertySchema, { purchasePrice: "-1" })
  })

  test("valuation: a real date and a positive value; the note is optional", () => {
    ok(createPropertyValuationSchema, { valuationDate: "2024-01-01", value: "520000" })
    ok(createPropertyValuationSchema, { valuationDate: "2024-01-01", value: "520000.5", note: "WOZ 2024" })
    bad(createPropertyValuationSchema, { valuationDate: "2024-13-01", value: "1" })
    bad(createPropertyValuationSchema, { valuationDate: "2024-01-01", value: "0" }, "value must be greater than 0")
    bad(createPropertyValuationSchema, { valuationDate: "2024-01-01" })
  })

  test("links: lists of ids, both default to empty", () => {
    expect(setPropertyLinksSchema.parse({})).toEqual({ mortgageIds: [], loanIds: [] })
    ok(setPropertyLinksSchema, { mortgageIds: ["123e4567-e89b-42d3-a456-426614174000"], loanIds: [] })
    bad(setPropertyLinksSchema, { mortgageIds: ["not-an-id"] })
    bad(setPropertyLinksSchema, { loanIds: "x" })
  })
})
