import { useState } from "react"
import type { MetalPortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import { SummaryTiles, standardTiles } from "../SummaryTiles"
import { LotForm } from "./LotForm"
import { LotsTable } from "./LotsTable"

/** What is inside a precious-metals portfolio: totals, the lots inventory, and the add-lot form. */
export function MetalsView({ portfolio }: { portfolio: MetalPortfolioDetail }) {
  const [adding, setAdding] = useState(false)
  const cur = portfolio.currency

  return (
    <>
      <SummaryTiles
        tiles={standardTiles(
          { openCost: portfolio.totalInvestedOpen, currentValue: portfolio.totalCurrentValueOpen, unrealized: portfolio.totalUnrealizedPnL, realized: portfolio.totalRealizedPnL },
          cur,
        )}
      />
      <LotsTable portfolioId={portfolio.id} lots={portfolio.lots} currency={cur} canEdit={portfolio.canEdit} />

      {portfolio.canEdit &&
        (adding ? (
          <LotForm portfolio={portfolio} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="link" className="mb-4 font-normal" onClick={() => setAdding(true)}>
            + Add lot
          </Button>
        ))}
    </>
  )
}
