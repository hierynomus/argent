import { describe, expect, test } from "vitest"
import { mockApi } from "../../../test/fakeApi"
import { renderApp, screen, userEvent } from "../../../test/render"
import NetWorthHistoryCard from "./NetWorthHistoryCard.vue"

const point = (date: string, netWorth: number) => ({ date, banking: netWorth, investments: 0, property: 0, pensions: 0, debts: 0, netWorth })
const today = new Date().toISOString().slice(0, 10)
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

describe("NetWorthHistoryCard", () => {
  test("shows the change over the chosen range next to the chart", async () => {
    mockApi({ "GET /net-worth/history": { currency: "EUR", points: [point(ago(900), 10000), point(ago(300), 40000), point(ago(100), 45000), point(today, 50000)] } })
    await renderApp(NetWorthHistoryCard)
    expect(await screen.findByRole("img", { name: "Net worth, last year" })).toBeInTheDocument()
    const card = screen.getByLabelText("Net worth over time")
    // last year: from the balance a year ago (10,000, carried from the point before the range) to 50,000
    expect(card).toHaveTextContent(/\+.*40\.000,00/)
    expect(card).toHaveTextContent("+400.0%")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "3M" }))
    expect(screen.getByRole("img", { name: "Net worth, last 3 months" })).toBeInTheDocument()
    expect(card).toHaveTextContent("+11.1%") // 45,000 a quarter ago to 50,000
    await user.click(screen.getByRole("button", { name: "All" }))
    expect(screen.getByRole("img", { name: "Net worth, since the start" })).toBeInTheDocument()
  })

  test("nothing to draw without history", async () => {
    mockApi({ "GET /net-worth/history": { currency: "EUR", points: [] } })
    await renderApp(NetWorthHistoryCard)
    expect(screen.queryByLabelText("Net worth over time")).toBeNull()
  })
})
