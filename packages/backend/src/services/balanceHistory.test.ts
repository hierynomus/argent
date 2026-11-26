import { describe, expect, test } from "bun:test"
import { balanceHistory } from "./balanceHistory"

describe("balanceHistory", () => {
  test("a running sum from the opening balance, carried on to today", () => {
    const points = balanceHistory("100", "2026-01-01", [
      { date: "2026-01-10", net: "-30.50" },
      { date: "2026-01-05", net: "50" },
    ], "2026-02-01")
    expect(points).toEqual([
      { date: "2026-01-01", balance: "100.00" },
      { date: "2026-01-05", balance: "150.00" },
      { date: "2026-01-10", balance: "119.50" },
      { date: "2026-02-01", balance: "119.50" },
    ])
  })

  test("transactions before the opening date are ignored, like in the balance", () => {
    const points = balanceHistory("10", "2026-03-01", [{ date: "2026-02-01", net: "999" }, { date: "2026-03-01", net: "5" }], "2026-03-01")
    expect(points).toEqual([{ date: "2026-03-01", balance: "15.00" }])
  })

  test("without an opening date it starts at the first transaction", () => {
    const points = balanceHistory("0", null, [{ date: "2026-01-02", net: "-4" }], "2026-01-02")
    expect(points).toEqual([{ date: "2026-01-02", balance: "-4.00" }])
  })

  test("nothing at all gives no points", () => {
    expect(balanceHistory("0", null, [], "2026-01-02")).toEqual([])
  })
})
