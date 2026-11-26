import { describe, expect, test } from "vitest"
import { mockApi } from "../../../test/fakeApi"
import { renderApp, screen, userEvent } from "../../../test/render"
import BalanceChart from "./BalanceChart.vue"

describe("BalanceChart", () => {
  test("draws the balance over time for an account", async () => {
    mockApi({
      "GET /accounts/a1/balance-history": {
        currency: "EUR",
        points: [
          { date: "2026-03-01", balance: "100.00" },
          { date: "2026-03-05", balance: "70.00" },
          { date: "2026-03-20", balance: "70.00" },
        ],
      },
    })
    await renderApp(BalanceChart, { props: { accountId: "a1", name: "Joint" } })
    expect(await screen.findByLabelText("Joint balance, last year")).toBeTruthy()
  })

  test("shows nothing while there is no history to draw", async () => {
    mockApi({ "GET /accounts/a1/balance-history": { currency: "EUR", points: [] } })
    await renderApp(BalanceChart, { props: { accountId: "a1", name: "Joint" } })
    expect(screen.queryByText("Balance over time")).toBeNull()
  })

  test("the range buttons narrow the chart", async () => {
    mockApi({
      "GET /accounts/a1/balance-history": {
        currency: "EUR",
        points: [
          { date: "2024-01-01", balance: "100.00" },
          { date: "2026-03-05", balance: "70.00" },
          { date: "2026-03-20", balance: "70.00" },
        ],
      },
    })
    await renderApp(BalanceChart, { props: { accountId: "a1", name: "Joint" } })
    await userEvent.click(await screen.findByRole("button", { name: "1M" }))
    expect(screen.getByRole("button", { name: "1M" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByLabelText("Joint balance, last month")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "All" }))
    expect(screen.getByLabelText("Joint balance, all time")).toBeTruthy()
  })
})
