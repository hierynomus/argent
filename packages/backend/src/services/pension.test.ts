import { describe, expect, test } from "bun:test"
import { countsByDefault, latestStatementOf, netWorthValueOf, planState } from "./pension"

describe("latestStatementOf", () => {
  const s = (statementDate: string, id = statementDate) => ({ statementDate, id })
  test("the latest statement dated today or earlier counts, flat until the next", () => {
    expect(latestStatementOf([s("2023-01-01"), s("2024-01-01"), s("2025-01-01")], "2024-06-01")?.statementDate).toBe("2024-01-01")
    expect(latestStatementOf([s("2023-01-01")], "2023-01-01")?.statementDate).toBe("2023-01-01")
  })
  test("none before today means none", () => {
    expect(latestStatementOf([s("2030-01-01")], "2024-06-01")).toBeNull()
    expect(latestStatementOf([], "2024-06-01")).toBeNull()
  })
  test("on the same date the one entered last wins", () => {
    expect(latestStatementOf([s("2024-01-01", "first"), s("2024-01-01", "second")], "2024-06-01")?.id).toBe("second")
  })
})

describe("planState", () => {
  test("closed from the closing date on, otherwise as stored", () => {
    expect(planState({ status: "active", closedOn: null }, "2024-06-01")).toBe("active")
    expect(planState({ status: "frozen", closedOn: null }, "2024-06-01")).toBe("frozen")
    expect(planState({ status: "frozen", closedOn: "2024-06-01" }, "2024-06-01")).toBe("closed")
    expect(planState({ status: "active", closedOn: "2024-06-02" }, "2024-06-01")).toBe("active") // closes tomorrow
  })
})

describe("what counts in net worth", () => {
  test("pots count by default, rights and the state pension do not", () => {
    expect(countsByDefault("occupational_dc")).toBe(true)
    expect(countsByDefault("personal")).toBe(true)
    expect(countsByDefault("occupational_db")).toBe(false)
    expect(countsByDefault("state")).toBe(false)
  })
  test("only an open plan that counts, with a capital", () => {
    expect(netWorthValueOf({ countInNetWorth: true, state: "active" }, 1000)).toBe(1000)
    expect(netWorthValueOf({ countInNetWorth: true, state: "frozen" }, 1000)).toBe(1000)
    expect(netWorthValueOf({ countInNetWorth: true, state: "closed" }, 1000)).toBe(0)
    expect(netWorthValueOf({ countInNetWorth: false, state: "active" }, 1000)).toBe(0)
    expect(netWorthValueOf({ countInNetWorth: true, state: "active" }, null)).toBe(0)
  })
})
