import { describe, expect, test } from "vitest"
import { account } from "../../../test/fixtures"
import { groupAccounts, holdersOf, totalsByCurrency } from "./groupAccounts"

const list = [
  account({ id: "1", name: "Everyday", holder: "Sam", balance: "100.00" }),
  account({ id: "2", name: "Savings", type: "savings", holder: "Alex", balance: "900.50" }),
  account({ id: "3", name: "Wallet", type: "cash", holder: null, balance: "20.00" }),
  account({ id: "4", name: "Dollars", holder: "Alex", currency: "USD", balance: "50.00" }),
  account({ id: "5", name: "Closed", holder: "Alex", balance: "0.00", hidden: true }),
]

describe("groupAccounts", () => {
  test("groups by holder alphabetically, accounts without a holder last, accounts by name", async () => {
    const { groups } = groupAccounts(list)
    expect(groups.map((g) => g.holder)).toEqual(["Alex", "Sam", null])
    expect(groups[0]!.accounts.map((a) => a.name)).toEqual(["Dollars", "Savings"])
  })

  test("totals are per currency and EUR and USD are never added", async () => {
    const alex = groupAccounts(list).groups[0]!
    expect(alex.totals).toEqual([{ currency: "USD", total: 50 }, { currency: "EUR", total: 900.5 }])
  })

  test("hidden accounts are left out and counted, unless asked for", async () => {
    expect(groupAccounts(list).hiddenCount).toBe(1)
    expect(groupAccounts(list).groups.flatMap((g) => g.accounts.map((a) => a.name))).not.toContain("Closed")
    const shown = groupAccounts(list, { showHidden: true })
    expect(shown.groups[0]!.accounts.map((a) => a.name)).toContain("Closed")
    // a hidden account does not count in the subtotal
    expect(shown.groups[0]!.totals.find((t) => t.currency === "EUR")!.total).toBe(900.5)
  })

  test("filters by type and by a search over name, IBAN and holder", async () => {
    expect(groupAccounts(list, { type: "savings" }).groups.flatMap((g) => g.accounts.map((a) => a.id))).toEqual(["2"])
    expect(groupAccounts(list, { query: "sam" }).groups.flatMap((g) => g.accounts.map((a) => a.id))).toEqual(["1"])
    expect(groupAccounts(list, { query: "WALLET" }).groups.flatMap((g) => g.accounts.map((a) => a.id))).toEqual(["3"])
    expect(groupAccounts(list, { query: "nothing like this" }).groups).toEqual([])
  })

  test("holdersOf lists each holder once, sorted", async () => {
    expect(holdersOf(list)).toEqual(["Alex", "Sam"])
  })

  test("totalsByCurrency rounds to cents", async () => {
    expect(totalsByCurrency([{ currency: "EUR", balance: "0.10" }, { currency: "EUR", balance: "0.20" }])).toEqual([{ currency: "EUR", total: 0.3 }])
  })
})
