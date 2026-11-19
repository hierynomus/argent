import { describe, expect, test } from "vitest"
import { stockPosition } from "../../../test/fixtures"
import { renderApp, screen } from "../../../test/render"
import PositionsTable from "./PositionsTable.vue"
import { standardTiles } from "./tiles"

const tile = (tiles: ReturnType<typeof standardTiles>, label: string) => tiles.find((t) => t.label === label)!

describe("P&L colours: green for a gain, red for a loss", () => {
  test("the tiles", () => {
    const gain = standardTiles({ openCost: 100, currentValue: 150, unrealized: 50, realized: 10 }, "EUR")
    expect(tile(gain, "Unrealized P&L").color).toContain("text-green")
    expect(tile(gain, "Realized P&L").color).toContain("text-green")
    const loss = standardTiles({ openCost: 100, currentValue: 60, unrealized: -40, realized: -5 }, "EUR")
    expect(tile(loss, "Unrealized P&L").color).toContain("text-red")
    expect(tile(loss, "Realized P&L").color).toContain("text-red")
  })

  test("the positions table (also the overview tab's, which uses it)", async () => {
    await renderApp(PositionsTable, {
      props: {
        positions: [stockPosition({ symbol: "UP", unrealizedPnL: 200, realizedPnL: 5 }), stockPosition({ symbol: "DOWN", unrealizedPnL: -75, realizedPnL: -3 })],
        currency: "USD", balanceHeader: "Shares", formatBalance: String, minWidth: "min-w-[600px]",
      },
    })
    expect(screen.getByText(/\+\$?\s?200/)).toHaveClass("text-green-600")
    expect(screen.getByText(/-\$?\s?75/)).toHaveClass("text-red-600")
  })
})
