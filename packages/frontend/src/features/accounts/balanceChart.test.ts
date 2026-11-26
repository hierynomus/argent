import { describe, expect, test } from "vitest"
import { mockApi } from "../../../test/fakeApi"
import { renderApp, screen } from "../../../test/render"
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
    expect(await screen.findByLabelText("Joint balance over time")).toBeTruthy()
  })

  test("shows nothing while there is no history to draw", async () => {
    mockApi({ "GET /accounts/a1/balance-history": { currency: "EUR", points: [] } })
    await renderApp(BalanceChart, { props: { accountId: "a1", name: "Joint" } })
    expect(screen.queryByText("Balance over time")).toBeNull()
  })
})
