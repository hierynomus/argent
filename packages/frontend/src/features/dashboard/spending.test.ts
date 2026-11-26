import { describe, expect, test } from "vitest"
import { category, transaction } from "../../../test/fixtures"
import { spendingByCategory } from "./spending"

const food = category({ id: "food", name: "Food" })
const lunch = category({ id: "lunch", name: "Lunch", parentId: "food" })
const fun = category({ id: "fun", name: "Fun", color: "#ff0000" })
const cats = [food, lunch, fun]
const tx = (amount: string, cat: ReturnType<typeof category> | null, over = {}) => transaction({ amount, category: cat, categoryId: cat?.id ?? null, ...over })

describe("spendingByCategory", () => {
  test("adds up payments out per category, largest first, subcategories with their parent", () => {
    const { rows, total } = spendingByCategory([tx("10.10", food), tx("20.20", lunch), tx("5", fun), tx("7", null)], [], cats)
    expect(rows.map((r) => [r.name, r.amount])).toEqual([["Food", 30.3], ["Uncategorised", 7], ["Fun", 5]])
    expect(total).toBe(42.3)
    expect(rows[0]!.percent).toBeCloseTo(71.6, 1)
    expect(rows.find((r) => r.name === "Fun")!.color).toBe("#ff0000")
  })

  test("money in, transfers between own accounts and other currencies are not spending", () => {
    const { rows } = spendingByCategory([
      tx("100", food, { creditDebitIndicator: "CRDT" }),
      tx("50", food, { transferPeerId: "x" }),
      tx("40", food, { currency: "USD" }),
      tx("3", food),
    ], [], cats)
    expect(rows).toEqual([expect.objectContaining({ name: "Food", amount: 3 })])
  })

  test("carries last month's figure per category", () => {
    const { rows, previousTotal } = spendingByCategory([tx("30", food), tx("5", fun)], [tx("20", food), tx("2", lunch), tx("9", null)], cats)
    expect(rows.find((r) => r.name === "Food")!.previous).toBe(22)
    expect(rows.find((r) => r.name === "Fun")!.previous).toBe(0)
    expect(previousTotal).toBe(31)
  })

  test("beyond the top rows the rest is one Other row, and cents do not drift", () => {
    const many = Array.from({ length: 8 }, (_, i) => category({ id: `c${i}`, name: `Cat ${i}` }))
    const { rows, total } = spendingByCategory(many.map((c, i) => tx(`${10 - i}.10`, c)), [], many, 3)
    expect(rows.map((r) => r.name)).toEqual(["Cat 0", "Cat 1", "Cat 2", "Other"])
    expect(rows.at(-1)!.amount).toBe(7.1 + 6.1 + 5.1 + 4.1 + 3.1)
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBeCloseTo(total, 2)
  })

  test("nothing spent gives no rows", () => {
    expect(spendingByCategory([], [], cats)).toEqual({ rows: [], total: 0, previousTotal: 0 })
  })
})
