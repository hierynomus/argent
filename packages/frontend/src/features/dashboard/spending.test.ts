import { describe, expect, test } from "vitest"
import type { TransactionSummary } from "@argent/shared"
import { category } from "../../../test/fixtures"
import { spendingByCategory } from "./spending"

const food = category({ id: "food", name: "Food" })
const lunch = category({ id: "lunch", name: "Lunch", parentId: "food" })
const fun = category({ id: "fun", name: "Fun", color: "#ff0000" })
const cats = [food, lunch, fun]
/** a summary from [categoryId, expenses] pairs */
const summary = (rows: Array<[string | null, number]>, over: Partial<TransactionSummary> = {}): TransactionSummary => ({
  from: "2026-03-01", to: "2026-03-31", currency: "EUR", income: 0,
  expenses: rows.reduce((n, [, e]) => n + Math.round(e * 100), 0) / 100,
  byCategory: rows.map(([categoryId, expenses]) => ({ categoryId, expenses, income: 0 })), ...over,
})

describe("spendingByCategory", () => {
  test("per category, largest first, subcategories with their parent", () => {
    const { rows, total } = spendingByCategory(summary([["food", 10.1], ["lunch", 20.2], ["fun", 5], [null, 7]]), [], cats)
    expect(rows.map((r) => [r.name, r.amount])).toEqual([["Food", 30.3], ["Uncategorised", 7], ["Fun", 5]])
    expect(total).toBe(42.3)
    expect(rows[0]!.percent).toBeCloseTo(71.6, 1)
    expect(rows.find((r) => r.name === "Fun")!.color).toBe("#ff0000")
  })

  test("each row knows which labels to filter the transactions by", () => {
    const { rows } = spendingByCategory(summary([["food", 10], ["fun", 5], [null, 7]]), [], cats)
    expect(rows.find((r) => r.name === "Food")!.categoryIds).toEqual(["food", "lunch"]) // the parent and its subcategories
    expect(rows.find((r) => r.name === "Fun")!.categoryIds).toEqual(["fun"])
    expect(rows.find((r) => r.name === "Uncategorised")!.categoryIds).toEqual(["uncategorized"])
  })

  test("carries last month's figure, or the average of several months", () => {
    const now = summary([["food", 30], ["fun", 5]])
    const one = spendingByCategory(now, [summary([["food", 20], ["lunch", 2], [null, 9]])], cats)
    expect(one.rows.find((r) => r.name === "Food")!.previous).toBe(22)
    expect(one.rows.find((r) => r.name === "Fun")!.previous).toBe(0)
    expect(one.previousTotal).toBe(31)
    const avg = spendingByCategory(now, [summary([["food", 10]]), summary([["food", 20]]), summary([["food", 15]])], cats)
    expect(avg.rows.find((r) => r.name === "Food")!.previous).toBe(15)
    expect(avg.previousTotal).toBe(15)
  })

  test("beyond the top rows the rest is one Other row with all their labels; cents do not drift", () => {
    const many = Array.from({ length: 8 }, (_, i) => category({ id: `c${i}`, name: `Cat ${i}` }))
    const { rows, total } = spendingByCategory(summary(many.map((c, i) => [c.id, 10 - i + 0.1] as [string, number])), [], many, 3)
    expect(rows.map((r) => r.name)).toEqual(["Cat 0", "Cat 1", "Cat 2", "Other"])
    expect(rows.at(-1)!.amount).toBeCloseTo(7.1 + 6.1 + 5.1 + 4.1 + 3.1, 2)
    expect(rows.at(-1)!.categoryIds).toEqual(["c3", "c4", "c5", "c6", "c7"])
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBeCloseTo(total, 2)
  })

  test("income only or nothing at all gives no rows", () => {
    expect(spendingByCategory(summary([]), [], cats)).toEqual({ rows: [], total: 0, previousTotal: 0 })
    expect(spendingByCategory(summary([["food", 0]]), [], cats).rows).toEqual([])
  })
})
