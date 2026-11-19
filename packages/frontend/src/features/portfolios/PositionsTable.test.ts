import { describe, expect, test } from "vitest"
import { stockPosition } from "../../../test/fixtures"
import { renderApp, screen } from "../../../test/render"
import PositionsTable from "./PositionsTable.vue"

const props = (positions: ReturnType<typeof stockPosition>[]) => ({ positions, currency: "USD", balanceHeader: "Shares", formatBalance: String, minWidth: "min-w-[600px]" })

describe("PositionsTable: a position without a live price", () => {
  test("an open position says 'no price' (its value is missing from the totals), not a bare dash", async () => {
    await renderApp(PositionsTable, { props: props([stockPosition({ symbol: "XYZ", currentPrice: null, currentValue: null, unrealizedPnL: null })]) })
    const badge = screen.getByText("no price")
    expect(badge).toHaveAttribute("title", expect.stringContaining("left out of the totals"))
  })

  test("a priced position has no badge, and a closed position needs no price", async () => {
    await renderApp(PositionsTable, {
      props: props([stockPosition({ symbol: "AAPL" }), stockPosition({ symbol: "OLD", balance: 0, totalCost: 0, currentPrice: null, currentValue: null, unrealizedPnL: null })]),
    })
    expect(screen.queryByText("no price")).toBeNull()
  })
})
