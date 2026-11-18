import { PortfolioPage } from "../features/portfolios/PortfolioPage"
import { StocksView } from "../features/portfolios/stocks/StocksView"

export default function StocksPage() {
  return <PortfolioPage kind="stocks" title="Stocks" emptyNoun="stock" withBroker renderDetail={(p) => <StocksView portfolio={p} />} />
}
