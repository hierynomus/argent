import { useState } from "react"
import type { StockPortfolioDetail } from "@argent/shared"
import { Button } from "../../../components/ui"
import { fmtMaxDecimals, fmtSymbolCur } from "../../../lib/format"
import { PositionsTable } from "../PositionsTable"
import { SummaryTiles, standardTiles } from "../SummaryTiles"
import { TradeHistory } from "../TradeHistory"
import { DividendForm } from "./DividendForm"
import { DividendHistory } from "./DividendHistory"
import { StockTradeForm } from "./StockTradeForm"

type Mode = "idle" | "trade" | "dividend"

/** What is inside a stock/ETF portfolio: totals, positions, trade + dividend forms and their histories. */
export function StocksView({ portfolio }: { portfolio: StockPortfolioDetail }) {
  const [mode, setMode] = useState<Mode>("idle")
  const cur = portfolio.currency
  const close = () => setMode("idle")

  const tiles = [
    ...standardTiles(
      { openCost: portfolio.totalOpenCostEur, currentValue: portfolio.totalCurrentValueEur, unrealized: portfolio.totalUnrealizedPnL, realized: portfolio.totalRealizedPnL },
      cur,
    ),
    { label: "Dividends", value: fmtSymbolCur(portfolio.totalDividends, cur), color: portfolio.totalDividends > 0 ? "text-green-600 dark:text-green-400" : undefined },
  ]

  return (
    <>
      <SummaryTiles tiles={tiles} />
      <PositionsTable positions={portfolio.positions} currency={cur} balanceHeader="Shares" formatBalance={(n) => fmtMaxDecimals(n, 4)} showDividends minWidth="min-w-[780px]" />

      {portfolio.canEdit && mode === "idle" && (
        <div className="flex gap-4 mb-4">
          <Button variant="link" className="font-normal" onClick={() => setMode("trade")}>
            + Record trade
          </Button>
          <Button variant="link" className="font-normal" onClick={() => setMode("dividend")}>
            + Record dividend
          </Button>
        </div>
      )}
      {portfolio.canEdit && mode === "trade" && <StockTradeForm portfolio={portfolio} onDone={close} />}
      {portfolio.canEdit && mode === "dividend" && <DividendForm portfolio={portfolio} onDone={close} />}

      <TradeHistory trades={portfolio.trades} currency={cur} formatAmount={(n) => fmtMaxDecimals(n, 4)} className="mb-4" />
      <DividendHistory dividends={portfolio.dividends} currency={cur} canEdit={portfolio.canEdit} />
    </>
  )
}
