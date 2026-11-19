import { describe, expect, test } from "bun:test"
import { computeCash } from "./cash"

const pf = (over: object = {}) => ({ currency: "EUR", openingCash: "0", openingCashDate: null as string | null, ...over })
const mv = (movementDate: string, type: string, amount: string) => ({ movementDate, type, amount })
const buy = (tradeDate: string, eur: string, sym = "BTC") => ({ tradeDate, fromSymbol: "EUR", fromAmount: eur, toSymbol: sym, toAmount: "1" })
const sell = (tradeDate: string, eur: string, sym = "BTC") => ({ tradeDate, fromSymbol: sym, fromAmount: "1", toSymbol: "EUR", toAmount: eur })

describe("computeCash", () => {
  test("nothing recorded: nothing in the account", () => expect(computeCash(pf(), [], [])).toBe(0))

  test("deposits and interest add, withdrawals and fees subtract", () => {
    expect(computeCash(pf(), [mv("2024-01-01", "deposit", "1000"), mv("2024-02-01", "interest", "1.25"), mv("2024-03-01", "fee", "2.50"), mv("2024-04-01", "withdrawal", "100")], [])).toBe(898.75)
  })

  test("buys use the cash up and sells bring it back", () => {
    expect(computeCash(pf(), [mv("2024-01-01", "deposit", "1000")], [buy("2024-01-02", "400"), buy("2024-01-03", "100"), sell("2024-02-01", "250")])).toBe(750)
  })

  test("swaps between coins and trades in other currencies leave the cash alone", () => {
    const swap = { tradeDate: "2024-01-05", fromSymbol: "BTC", fromAmount: "1", toSymbol: "ETH", toAmount: "20" }
    expect(computeCash(pf(), [mv("2024-01-01", "deposit", "500")], [swap])).toBe(500)
  })

  test("dividends are paid into the account", () => {
    expect(computeCash(pf(), [mv("2024-01-01", "deposit", "500")], [], [{ paymentDate: "2024-06-01", amount: "12.34" }])).toBe(512.34)
  })

  test("opening cash counts, and only what happened from the opening date on is added to it", () => {
    const p = pf({ openingCash: "300", openingCashDate: "2024-03-01" })
    const cash = computeCash(p, [mv("2024-02-01", "deposit", "5000"), mv("2024-03-01", "deposit", "200")], [buy("2024-02-15", "900"), buy("2024-03-02", "50")], [{ paymentDate: "2024-01-01", amount: "99" }])
    expect(cash).toBe(450) // 300 + 200 − 50; everything before 1 March is inside the 300
  })

  test("the balance can be negative (the history entered is not necessarily complete)", () => {
    expect(computeCash(pf(), [], [buy("2024-01-01", "100")])).toBe(-100)
  })

  test("exact to the cent: ten deposits of 0.10 are 1.00", () => {
    expect(computeCash(pf(), Array.from({ length: 10 }, () => mv("2024-01-01", "deposit", "0.10")), [])).toBe(1)
  })

  test("a USD portfolio is paid for in USD", () => {
    const usd = { tradeDate: "2024-01-02", fromSymbol: "USD", fromAmount: "100", toSymbol: "AAPL", toAmount: "1" }
    expect(computeCash(pf({ currency: "USD" }), [mv("2024-01-01", "deposit", "500")], [usd, buy("2024-01-03", "999")])).toBe(400)
  })
})
