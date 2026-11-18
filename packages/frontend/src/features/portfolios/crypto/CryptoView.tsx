import { useState } from "react"
import type { PortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import { fmtSignificant } from "../../../lib/format"
import { PositionsTable } from "../PositionsTable"
import { SummaryTiles, standardTiles } from "../SummaryTiles"
import { TradeHistory } from "../TradeHistory"
import { CryptoTradeForm } from "./CryptoTradeForm"

/** What is inside a crypto portfolio: totals, positions, the trade form and the ledger. */
export function CryptoView({ portfolio }: { portfolio: PortfolioDetail }) {
  const [adding, setAdding] = useState(false)
  const cur = portfolio.currency

  return (
    <>
      <SummaryTiles
        tiles={standardTiles(
          { openCost: portfolio.totalOpenCostEur, currentValue: portfolio.totalCurrentValueEur, unrealized: portfolio.totalUnrealizedPnL, realized: portfolio.totalRealizedPnL },
          cur,
        )}
      />
      <PositionsTable positions={portfolio.positions} currency={cur} balanceHeader="Balance" formatBalance={(n) => fmtSignificant(n, 8)} minWidth="min-w-[700px]" />

      {portfolio.canEdit &&
        (adding ? (
          <CryptoTradeForm portfolio={portfolio} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="link" className="mb-4 font-normal" onClick={() => setAdding(true)}>
            + Record trade
          </Button>
        ))}

      <TradeHistory trades={portfolio.trades} currency={cur} formatAmount={(n) => fmtSignificant(n, 8)} />
    </>
  )
}
