import { MetalsView } from "../features/portfolios/metals/MetalsView"
import { PortfolioPage } from "../features/portfolios/PortfolioPage"

export default function MetalsPage() {
  return <PortfolioPage kind="metals" title="Precious Metals" emptyNoun="metals" renderDetail={(p) => <MetalsView portfolio={p} />} />
}
