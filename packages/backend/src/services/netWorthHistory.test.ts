import { describe, expect, test } from "bun:test"
import { firstDayOf, netWorthAt, netWorthHistory, sampleDays, type NetWorthData } from "./netWorthHistory"

const empty: NetWorthData = { accounts: [], trading: [], metals: [], properties: [], pensions: [], debts: [] }

describe("netWorthAt", () => {
  test("a bank account counts from its opening date, with the transactions up to the day", () => {
    const data: NetWorthData = { ...empty, accounts: [{ openingBalance: "100", openingBalanceDate: "2024-01-01", txs: [{ date: "2023-12-01", net: "999" }, { date: "2024-02-01", net: "-30.50" }, { date: "2024-03-01", net: "50" }] }] }
    expect(netWorthAt(data, "2023-12-31").banking).toBe(0) // not yet opened
    expect(netWorthAt(data, "2024-01-15").banking).toBe(100) // the 2023 transaction is before the opening date
    expect(netWorthAt(data, "2024-02-15").banking).toBe(69.5)
    expect(netWorthAt(data, "2024-03-01").banking).toBe(119.5)
  })

  test("debts are subtracted: the latest balance on or before the day, nothing before it started", () => {
    const data: NetWorthData = {
      ...empty,
      accounts: [{ openingBalance: "1000", openingBalanceDate: null, txs: [] }],
      debts: [[{ date: "2024-02-01", balance: 500 }, { date: "2024-03-01", balance: 400 }]],
    }
    expect(netWorthAt(data, "2024-01-15")).toMatchObject({ debts: 0, netWorth: 1000 })
    expect(netWorthAt(data, "2024-02-10")).toMatchObject({ debts: 500, netWorth: 500 })
    expect(netWorthAt(data, "2024-06-01")).toMatchObject({ debts: 400, netWorth: 600 })
  })

  test("property follows its valuations; a pension counts only its pot, while open and counted", () => {
    const data: NetWorthData = {
      ...empty,
      properties: [{ valuations: [{ valuationDate: "2022-01-01", value: "300000" }, { valuationDate: "2024-01-01", value: "350000" }], purchase: { price: "250000", date: "2020-01-01" } }],
      pensions: [
        { countInNetWorth: true, status: "active", closedOn: "2025-01-01", statements: [{ statementDate: "2023-01-01", capital: "10000" }, { statementDate: "2024-01-01", capital: "12000" }] },
        { countInNetWorth: false, status: "active", closedOn: null, statements: [{ statementDate: "2023-01-01", capital: "99999" }] },
      ],
    }
    expect(netWorthAt(data, "2020-06-01").property).toBe(250000) // the purchase price until a valuation exists
    expect(netWorthAt(data, "2023-06-01").property).toBe(300000)
    expect(netWorthAt(data, "2024-06-01").property).toBe(350000)
    expect(netWorthAt(data, "2022-06-01").pensions).toBe(0) // no statement yet
    expect(netWorthAt(data, "2023-06-01").pensions).toBe(10000)
    expect(netWorthAt(data, "2024-06-01").pensions).toBe(12000)
    expect(netWorthAt(data, "2025-06-01").pensions).toBe(0) // closed
  })

  test("investments are valued at cost, with the cash in their account; sold lots no longer count", () => {
    const data: NetWorthData = {
      ...empty,
      trading: [{
        currency: "EUR", openingCash: "0", openingCashDate: null,
        movements: [{ movementDate: "2024-01-01", type: "deposit", amount: "1000" }],
        trades: [
          { tradeDate: "2024-02-01", fromSymbol: "EUR", fromAmount: "600", toSymbol: "VWCE", toAmount: "5" },
          { tradeDate: "2024-04-01", fromSymbol: "VWCE", fromAmount: "5", toSymbol: "EUR", toAmount: "700" },
        ],
        dividends: [],
      }],
      metals: [{ lots: [{ id: "l1", purchaseDate: "2024-03-01", quantity: 10, pricePerPiece: "50" }], sales: [{ lotId: "l1", saleDate: "2024-05-01", quantitySold: 4 }] }],
    }
    expect(netWorthAt(data, "2024-01-15").investments).toBe(1000) // cash only
    expect(netWorthAt(data, "2024-02-15").investments).toBe(1000) // 400 cash + 600 of shares at cost
    expect(netWorthAt(data, "2024-03-15").investments).toBe(1500) // + 10 x 50 of metal
    expect(netWorthAt(data, "2024-04-15").investments).toBe(1100 + 500) // shares sold: 1000 - 600 + 700 cash, metal 500
    expect(netWorthAt(data, "2024-05-15").investments).toBe(1100 + 300) // 4 of the 10 pieces sold
  })
})

describe("history", () => {
  test("sampling: the first day, month-ends, weekly for the last 400 days, and today", () => {
    const days = sampleDays("2020-03-10", "2026-11-26")
    expect(days[0]).toBe("2020-03-10")
    expect(days.at(-1)).toBe("2026-11-26")
    expect(days).toContain("2020-03-31")
    expect(days).toContain("2026-11-19") // weekly near today
    expect(days).toEqual([...days].sort())
    expect(new Set(days).size).toBe(days.length)
    expect(days.length).toBeLessThan(150)
  })

  test("nothing dated gives no history; otherwise it starts at the first day and ends today", () => {
    expect(netWorthHistory(empty, "2026-11-26")).toEqual([])
    const data: NetWorthData = { ...empty, accounts: [{ openingBalance: "5", openingBalanceDate: "2026-11-01", txs: [] }] }
    expect(firstDayOf(data)).toBe("2026-11-01")
    const h = netWorthHistory(data, "2026-11-26")
    expect(h[0]!.date).toBe("2026-11-01")
    expect(h.at(-1)!).toMatchObject({ date: "2026-11-26", netWorth: 5 })
  })
})
