import type {
  AddPortfolioMemberBody, CreateCryptoTradeBody, CreateMetalLotBody, CreateMetalSaleBody, CreatePortfolioBody,
  CreateStockDividendBody, CreateStockTradeBody, CryptoTrade, MetalLot, MetalPortfolioDetail, MetalSale, Portfolio,
  PortfolioDetail, PortfolioMember, PortfolioWithAccess, PriceHistory, HistoryRange, StockDividend, StockLookup, StockPortfolioDetail, StockTrade,
} from "@argent/shared"
import { http } from "./client"
import type { PortfolioKind } from "./keys"

/** The endpoints every portfolio type shares: CRUD plus sharing. `TDetail` is the type-specific detail payload. */
function portfolioApi<TDetail>(kind: PortfolioKind) {
  const base = `/${kind}`
  return {
    list: () => http.get<PortfolioWithAccess[]>(base),
    get: (id: string) => http.get<TDetail>(`${base}/${id}`),
    create: (body: CreatePortfolioBody) => http.post<Portfolio>(base, body),
    remove: (id: string) => http.delete(`${base}/${id}`),
    addMember: (id: string, body: AddPortfolioMemberBody) => http.post<PortfolioMember>(`${base}/${id}/members`, body),
    removeMember: (id: string, groupName: string) => http.delete(`${base}/${id}/members/${encodeURIComponent(groupName)}`),
  }
}

/** Price history of one asset (the asset chart). Not tied to a portfolio. */
export interface HistoryParams {
  range: HistoryRange
  currency: "EUR" | "USD"
}
const historyApi = (kind: "crypto" | "stocks") => (symbol: string, { range, currency }: HistoryParams) =>
  http.get<PriceHistory>(`/${kind}/history/${encodeURIComponent(symbol)}?range=${range}&currency=${currency}`)

export const cryptoApi = {
  ...portfolioApi<PortfolioDetail>("crypto"),
  history: historyApi("crypto"),
  addTrade: (portfolioId: string, body: CreateCryptoTradeBody) => http.post<CryptoTrade>(`/crypto/${portfolioId}/trades`, body),
}

export const metalsApi = {
  ...portfolioApi<MetalPortfolioDetail>("metals"),
  addLot: (portfolioId: string, body: CreateMetalLotBody) => http.post<MetalLot>(`/metals/${portfolioId}/lots`, body),
  addSale: (portfolioId: string, lotId: string, body: CreateMetalSaleBody) =>
    http.post<MetalSale>(`/metals/${portfolioId}/lots/${lotId}/sales`, body),
}

export const stocksApi = {
  ...portfolioApi<StockPortfolioDetail>("stocks"),
  history: historyApi("stocks"),
  addTrade: (portfolioId: string, body: CreateStockTradeBody) => http.post<StockTrade>(`/stocks/${portfolioId}/trades`, body),
  lookup: (symbol: string) => http.get<StockLookup>(`/stocks/lookup/${encodeURIComponent(symbol)}`),
  addDividend: (portfolioId: string, body: CreateStockDividendBody) => http.post<StockDividend>(`/stocks/${portfolioId}/dividends`, body),
  removeDividend: (portfolioId: string, dividendId: string) => http.delete(`/stocks/${portfolioId}/dividends/${dividendId}`),
}

/** Detail payload type per portfolio kind. */
export interface PortfolioDetailByKind {
  crypto: PortfolioDetail
  metals: MetalPortfolioDetail
  stocks: StockPortfolioDetail
}

export const portfolioApis = { crypto: cryptoApi, metals: metalsApi, stocks: stocksApi } as const
