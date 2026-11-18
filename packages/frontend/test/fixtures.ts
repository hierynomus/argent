/** Typed API fixtures — checked against @argent/shared, so test data can't silently drift from the real shapes. */
import type {
  Account, Category, LoanPart, LoanWithParts, MetalLot, MetalPortfolioDetail, MortgagePart, MortgageWithParts,
  EquityPlanWithDetails, PortfolioDetail, PortfolioWithAccess, PropertyWithDetails, StockPortfolioDetail, StockPosition, Subscription,
} from "@argent/shared"

/** A mortgage part or a loan part (identical shapes apart from the parent's foreign key). */
export const part = (over: Partial<MortgagePart & LoanPart> = {}): MortgagePart & LoanPart => ({
  id: "part-1", mortgageId: "d1", loanId: "d1", name: "Part A", type: "annuity", principal: "200000.00", annualInterestRate: "0.0350", rateType: "nominal",
  startDate: "2020-01-01", endDate: "2050-01-01", createdAt: "2020-01-01T00:00:00Z", extraPayments: [],
  currentBalance: 180000, monthlyPayment: 900, monthlyInterest: 525, monthlyPrincipal: 375, originalMonthlyPayment: 898,
  totalMonths: 360, monthsElapsed: 60, monthsRemaining: 300, projectedEndDate: "2050-01-01", ...over,
})

/** A mortgage or loan (identical shapes) owned by the current user. */
export const debt = (over: Partial<MortgageWithParts & LoanWithParts> = {}): MortgageWithParts & LoanWithParts => ({
  id: "d1", name: "House", ownerSub: "dev-user", currency: "EUR", createdAt: "2020-01-01T00:00:00Z",
  parts: [part()], totalCurrentBalance: 180000, totalMonthlyPayment: 900, members: [], isOwner: true, canEdit: true, ...over,
} as MortgageWithParts & LoanWithParts)

export const portfolio = (over: Partial<PortfolioWithAccess> = {}): PortfolioWithAccess => ({
  id: "p1", type: "crypto", name: "Main", ownerSub: "dev-user", currency: "EUR", broker: null, createdAt: "2024-01-01T00:00:00Z",
  members: [], isOwner: true, canEdit: true, ...over,
})

export const cryptoDetail = (over: Partial<PortfolioDetail> = {}): PortfolioDetail => ({
  ...portfolio(), trades: [], positions: [], totalOpenCostEur: 0, totalCurrentValueEur: null, totalRealizedPnL: 0, totalUnrealizedPnL: null, ...over,
} as PortfolioDetail)

export const stockPosition = (over: Partial<StockPosition> = {}): StockPosition => ({
  symbol: "AAPL", name: "Apple Inc.", assetForm: null, balance: 10, avgCostBasis: 80, totalCostEur: 800, realizedPnL: 0,
  currentPrice: 100, currentValueEur: 1000, unrealizedPnL: 200, totalDividends: 0, ...over,
})

export const stockDetail = (over: Partial<StockPortfolioDetail> = {}): StockPortfolioDetail => ({
  ...portfolio({ type: "stocks", broker: "DEGIRO", currency: "USD" }), trades: [], dividends: [], positions: [], totalOpenCostEur: 0,
  totalCurrentValueEur: null, totalRealizedPnL: 0, totalUnrealizedPnL: null, totalDividends: 0, ...over,
} as StockPortfolioDetail)

export const lot = (over: Partial<MetalLot> = {}): MetalLot => ({
  id: "lot-1", portfolioId: "p1", purchaseDate: "2024-01-01", metal: "gold", itemName: "Krugerrand", itemForm: "coin",
  weightPerPiece: "31.1035", unit: "g", quantity: 2, pricePerPiece: "1800.00", notes: null, createdAt: "2024-01-01T00:00:00Z",
  remainingQuantity: 2, currentPricePerGram: 60, currentValuePerPiece: 1866, unrealizedPnL: 132, realizedPnL: 0, sales: [], ...over,
})

export const metalDetail = (over: Partial<MetalPortfolioDetail> = {}): MetalPortfolioDetail => ({
  ...portfolio({ type: "metals" }), lots: [], totalInvestedOpen: 0, totalCurrentValueOpen: null, totalUnrealizedPnL: null, totalRealizedPnL: 0, ...over,
} as MetalPortfolioDetail)

export const account = (over: Partial<Account> = {}): Account => ({
  id: "a1", iban: "NL05TEST0417164300", name: "Checking", currency: "EUR", type: "checking", openingBalance: "100.00",
  openingBalanceDate: "2024-01-01", balance: "250.00", ownerSub: "dev-user", createdAt: "2024-01-01T00:00:00Z", ...over,
} as Account)

export const category = (over: Partial<Category> = {}): Category => ({ id: "c1", name: "Groceries", color: null, parentId: null, ...over } as Category)

export const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  id: "s1", accountId: "a1", name: null, counterpartyIban: "NL00STRM0000000001", counterpartyName: "Streamly", medianAmount: "9.99",
  currency: "EUR", intervalDays: 30, intervalLabel: "monthly", nextExpectedDate: "2024-07-01", lastSeenDate: "2024-06-01",
  isActive: true, status: "candidate", createdAt: "2024-01-01T00:00:00Z", transactionCount: 4, ...over,
})

import type { TransactionWithDetails, UserProfile } from "@argent/shared"

export const me = (over: Partial<UserProfile> = {}): UserProfile => ({
  sub: "dev-user", email: "dev@localhost", name: "Dev User", isAdmin: true, canImport: true, theme: "system", ...over,
} as UserProfile)

export const transaction = (over: Partial<TransactionWithDetails> = {}): TransactionWithDetails => ({
  id: "t1", accountId: "a1", amount: "12.50", currency: "EUR", creditDebitIndicator: "DBIT", bookingDate: "2024-06-01", valueDate: null,
  description: "Coffee beans", counterpartyName: "Roastery", counterpartyIban: null, reference: null, categoryId: null, transferPeerId: null,
  subscriptionId: null, importHash: "h", createdAt: "2024-06-01T00:00:00Z", account: account(), category: null, transferPeer: null, ...over,
} as TransactionWithDetails)

export const page = <T,>(data: T[]) => ({ data, total: data.length, page: 1, pageSize: 50 })

/** A house bought for 400k, worth 520k since the 2024 valuation, with a mortgage that still owes 300k. */
export const property = (over: Partial<PropertyWithDetails> = {}): PropertyWithDetails => ({
  id: "pr1", name: "Our house", type: "house", ownerSub: "dev-user", currency: "EUR", purchasePrice: "400000.00", purchaseDate: "2021-03-01", createdAt: "2021-03-01T00:00:00Z",
  valuations: [
    { id: "v1", propertyId: "pr1", valuationDate: "2021-03-01", value: "400000.00", note: "Purchase", createdAt: "2021-03-01T00:00:00Z" },
    { id: "v2", propertyId: "pr1", valuationDate: "2024-01-01", value: "520000.00", note: "WOZ 2024", createdAt: "2024-01-02T00:00:00Z" },
  ],
  currentValue: 520000, currentValueDate: "2024-01-01", gainSincePurchase: 120000,
  liabilities: [{ kind: "mortgage", id: "d1", name: "House", balance: 300000, monthlyPayment: 1500 }],
  debt: 300000, equity: 220000, members: [], isOwner: true, canEdit: true, ...over,
})

/** A company with 4800 options (24 of 48 months vested), 1000 more only on exit, and a share price of 12 against a strike of 2. */
export const equityPlan = (over: Partial<EquityPlanWithDetails> = {}): EquityPlanWithDetails => ({
  id: "eq1", name: "Acme BV", ownerSub: "dev-user", currency: "EUR", createdAt: "2023-01-01T00:00:00Z",
  prices: [
    { id: "p1", planId: "eq1", priceDate: "2023-01-01", price: "5.000000", note: "Seed", createdAt: "2023-01-01T00:00:00Z" },
    { id: "p2", planId: "eq1", priceDate: "2024-06-01", price: "12.000000", note: "Series A", createdAt: "2024-06-01T00:00:00Z" },
  ],
  currentPrice: 12, currentPriceDate: "2024-06-01",
  grants: [
    {
      id: "g1", planId: "eq1", label: "2023 grant", grantDate: "2023-01-01", options: "4800.00", strikePrice: "2.000000", vestingType: "time", vestStart: "2023-01-01",
      cliffMonths: 12, vestMonths: 48, createdAt: "2023-01-01T00:00:00Z", vested: 2400, unvested: 2400, onExit: 0, nextVestingDate: "2025-02-01",
      valuePerOption: 10, vestedValue: 24000, unvestedValue: 24000, onExitValue: 0,
    },
    {
      id: "g2", planId: "eq1", label: "Exit tranche", grantDate: "2023-06-01", options: "1000.00", strikePrice: "2.000000", vestingType: "exit", vestStart: null,
      cliffMonths: 0, vestMonths: null, createdAt: "2023-06-01T00:00:00Z", vested: 0, unvested: 0, onExit: 1000, nextVestingDate: null,
      valuePerOption: 10, vestedValue: 0, unvestedValue: 0, onExitValue: 10000,
    },
  ],
  totals: { granted: 5800, vested: 2400, unvested: 2400, onExit: 1000, vestedValue: 24000, unvestedValue: 24000, onExitValue: 10000 },
  members: [], isOwner: true, canEdit: true, ...over,
})
