import { CryptoView } from "../features/portfolios/crypto/CryptoView"
import { PortfolioPage } from "../features/portfolios/PortfolioPage"

export default function CryptoPage() {
  return <PortfolioPage kind="crypto" title="Crypto" emptyNoun="crypto" renderDetail={(p) => <CryptoView portfolio={p} />} />
}
