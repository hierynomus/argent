import type { z } from "zod"
import type * as S from "./schemas"

export type CreditDebitIndicator = "CRDT" | "DBIT"

export interface Account {
  id: string
  iban: string
  name: string | null
  currency: string
  type: "checking" | "savings"
  openingBalance: string
  openingBalanceDate: string | null
  balance: string
  ownerSub: string | null
  createdAt: string
}

export interface Category {
  id: string
  name: string
  color: string | null
  parentId: string | null
  createdAt: string
}

export interface Transaction {
  id: string
  accountId: string
  amount: string
  currency: string
  creditDebitIndicator: CreditDebitIndicator
  bookingDate: string
  valueDate: string | null
  description: string | null
  counterpartyName: string | null
  counterpartyIban: string | null
  reference: string | null
  categoryId: string | null
  transferPeerId: string | null
  subscriptionId: string | null
  createdAt: string
}

export interface TransferPeerSummary {
  id: string
  bookingDate: string
  amount: string
  creditDebitIndicator: CreditDebitIndicator
  currency: string
  account: Account
}

export interface TransactionWithDetails extends Transaction {
  account: Account
  category: Category | null
  transferPeer: TransferPeerSummary | null
}

// API request/response shapes
export interface ImportResult {
  accountIban: string
  imported: number
  skipped: number
}

export interface ImportZipResult {
  results: Array<ImportResult & { filename: string }>
  errors: Array<{ filename: string; error: string }>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface TransactionFilters {
  accountId?: string
  categoryId?: string | "uncategorized"
  from?: string
  to?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface Subscription {
  id: string
  accountId: string
  name: string | null
  counterpartyIban: string
  counterpartyName: string | null
  medianAmount: string
  currency: string
  intervalDays: number | null
  intervalLabel: string | null // weekly | bi-weekly | monthly | quarterly | yearly | custom
  nextExpectedDate: string | null
  lastSeenDate: string | null
  isActive: boolean
  status: "candidate" | "confirmed" | "dismissed"
  createdAt: string
  transactionCount?: number
}

export interface UserProfile {
  sub: string
  email: string | null
  name: string | null
  isAdmin: boolean
  canImport: boolean
  theme: "light" | "dark" | "system"
}

export interface Portfolio {
  id: string
  type: "crypto" | "metals" | "stocks"
  name: string
  ownerSub: string | null
  currency: string
  broker: string | null // stocks only
  createdAt: string
}

export interface PortfolioMember {
  groupName: string
  role: "viewer" | "editor"
}

export interface PortfolioWithAccess extends Portfolio {
  members: PortfolioMember[]
  isOwner: boolean
  canEdit: boolean
}

// ─── Crypto ────────────────────────────────────────────────────────────────

/** A single immutable crypto ledger entry (buy, sell, or swap) */
export interface CryptoTrade {
  id: string
  portfolioId: string
  tradeDate: string
  fromSymbol: string
  fromAmount: string
  toSymbol: string
  toAmount: string
  baseCurrencyAmount: string | null
  notes: string | null
  createdAt: string
}

/** Display metadata for a crypto symbol within a portfolio */
export interface CryptoAsset {
  portfolioId: string
  symbol: string
  name: string
  assetForm: string | null
}

/** FIFO-computed position for a single crypto symbol */
export interface AssetPosition {
  symbol: string
  name: string
  assetForm: string | null
  balance: number
  avgCostBasis: number
  totalCostEur: number
  realizedPnL: number
  currentPrice: number | null
  currentValueEur: number | null
  unrealizedPnL: number | null
}

export interface PortfolioDetail extends Portfolio {
  trades: CryptoTrade[]
  positions: AssetPosition[]
  totalOpenCostEur: number
  totalCurrentValueEur: number | null
  totalRealizedPnL: number
  totalUnrealizedPnL: number | null
  members: PortfolioMember[]
  isOwner: boolean
  canEdit: boolean
}

// ─── Metals ────────────────────────────────────────────────────────────────

/** An immutable sale event against a metal lot */
export interface MetalSale {
  id: string
  portfolioId: string
  lotId: string
  saleDate: string
  quantitySold: number
  totalReceived: string
  notes: string | null
  createdAt: string
}

/** A physical metals purchase lot with computed current values */
export interface MetalLot {
  id: string
  portfolioId: string
  purchaseDate: string
  metal: string
  itemName: string | null
  itemForm: string | null
  weightPerPiece: string
  unit: string               // "g" | "oz"
  quantity: number
  pricePerPiece: string
  notes: string | null
  createdAt: string
  // Computed by backend
  remainingQuantity: number
  currentPricePerGram: number | null
  currentValuePerPiece: number | null
  unrealizedPnL: number | null
  realizedPnL: number
  sales: MetalSale[]
}

export interface MetalPortfolioDetail extends Portfolio {
  lots: MetalLot[]
  totalInvestedOpen: number
  totalCurrentValueOpen: number | null
  totalUnrealizedPnL: number | null
  totalRealizedPnL: number
  members: PortfolioMember[]
  isOwner: boolean
  canEdit: boolean
}

// ─── Stocks / ETFs ──────────────────────────────────────────────────────────

/** A single immutable stock ledger entry (buy or sell) */
export interface StockTrade {
  id: string
  portfolioId: string
  tradeDate: string
  fromSymbol: string
  fromAmount: string
  toSymbol: string
  toAmount: string
  baseCurrencyAmount: string | null
  notes: string | null
  createdAt: string
}

/** Display metadata for a ticker symbol within a portfolio */
export interface StockAsset {
  portfolioId: string
  symbol: string
  name: string
  assetForm: string | null // "stock" | "etf"
}

/** A dividend payment for a symbol within a portfolio */
export interface StockDividend {
  id: string
  portfolioId: string
  symbol: string
  paymentDate: string
  amount: string
  notes: string | null
  createdAt: string
}

/** FIFO-computed position for a single ticker symbol */
export interface StockPosition {
  symbol: string
  name: string
  assetForm: string | null
  balance: number
  avgCostBasis: number
  totalCostEur: number
  realizedPnL: number
  currentPrice: number | null
  currentValueEur: number | null
  unrealizedPnL: number | null
  totalDividends: number
}

export interface StockPortfolioDetail extends Portfolio {
  trades: StockTrade[]
  dividends: StockDividend[]
  positions: StockPosition[]
  totalOpenCostEur: number
  totalCurrentValueEur: number | null
  totalRealizedPnL: number
  totalUnrealizedPnL: number | null
  totalDividends: number
  members: PortfolioMember[]
  isOwner: boolean
  canEdit: boolean
}

/** Ticker lookup result — used to auto-fill the asset name on the buy form */
export interface StockLookup {
  symbol: string
  name: string | null
}

// ─── Mortgages ──────────────────────────────────────────────────────────────

export interface Mortgage {
  id: string
  name: string
  ownerSub: string | null
  currency: string
  createdAt: string
}

export interface MortgageExtraPayment {
  id: string
  partId: string
  paymentDate: string
  amount: string
  notes: string | null
  createdAt: string
}

export interface MortgagePart {
  id: string
  mortgageId: string
  name: string
  type: "linear" | "annuity" | "interest_only"
  principal: string
  annualInterestRate: string
  /** how the rate is quoted: nominal (monthly = rate/12) or effective (monthly = (1+rate)^(1/12)-1) */
  rateType: "nominal" | "effective"
  startDate: string
  endDate: string
  createdAt: string
  extraPayments: MortgageExtraPayment[]
  // Computed by backend
  currentBalance: number
  monthlyPayment: number
  monthlyInterest: number
  monthlyPrincipal: number
  originalMonthlyPayment: number
  totalMonths: number
  monthsElapsed: number
  monthsRemaining: number
  /** date of the last payment at the current balance and payment size (earlier than endDate after extra payments) */
  projectedEndDate: string
}

export interface MortgageMember {
  groupName: string
  role: "viewer" | "editor"
}

export interface MortgageWithParts extends Mortgage {
  parts: MortgagePart[]
  totalCurrentBalance: number
  totalMonthlyPayment: number
  members: MortgageMember[]
  isOwner: boolean   // true when requester owns the mortgage (can delete + manage members)
  canEdit: boolean   // true when requester is owner or has editor role
}

// ─── Loans ──────────────────────────────────────────────────────────────────

export interface Loan {
  id: string
  name: string
  ownerSub: string | null
  currency: string
  createdAt: string
}

export interface LoanExtraPayment {
  id: string
  partId: string
  paymentDate: string
  amount: string
  notes: string | null
  createdAt: string
}

export interface LoanPart {
  id: string
  loanId: string
  name: string
  type: "linear" | "annuity" | "interest_only"
  principal: string
  annualInterestRate: string
  /** how the rate is quoted: nominal (monthly = rate/12) or effective (monthly = (1+rate)^(1/12)-1) */
  rateType: "nominal" | "effective"
  startDate: string
  endDate: string
  createdAt: string
  extraPayments: LoanExtraPayment[]
  // Computed by backend
  currentBalance: number
  monthlyPayment: number
  monthlyInterest: number
  monthlyPrincipal: number
  originalMonthlyPayment: number
  totalMonths: number
  monthsElapsed: number
  monthsRemaining: number
  /** date of the last payment at the current balance and payment size (earlier than endDate after extra payments) */
  projectedEndDate: string
}

export interface LoanMember {
  groupName: string
  role: "viewer" | "editor"
}

export interface LoanWithParts extends Loan {
  parts: LoanPart[]
  totalCurrentBalance: number
  totalMonthlyPayment: number
  members: LoanMember[]
  isOwner: boolean   // true when requester owns the loan (can delete + manage members)
  canEdit: boolean   // true when requester is owner or has editor role
}

export interface AccountMember {
  groupName: string
  role: "viewer" | "editor"
}

export interface AccountWithMembers extends Account {
  members: AccountMember[]
  ownerProfile: { email: string; name: string } | null
}

export interface AdminSharingEntry {
  id: string
  name: string
  members: { groupName: string; role: string }[]
}

export interface AdminSharingPortfolioEntry extends AdminSharingEntry {
  type: "crypto" | "metals" | "stocks"
}

export interface AdminSharingResponse {
  portfolios: AdminSharingPortfolioEntry[]
  mortgages: AdminSharingEntry[]
  loans: AdminSharingEntry[]
}

// ─── Request bodies ─────────────────────────────────────────────────────────
// Derived from the runtime schemas in `schemas.ts` (the single source of truth
// the backend validates against). `z.input` = what a client is allowed to send.

type Body<T extends z.ZodType> = z.input<T>

export type UpdateTransactionBody = Body<typeof S.updateTransactionSchema>
export type LinkTransferBody = Body<typeof S.linkTransferSchema>
export type UpdateAccountBody = Body<typeof S.updateAccountSchema>
export type CreateCategoryBody = Body<typeof S.createCategorySchema>
export type UpdateSubscriptionBody = Body<typeof S.updateSubscriptionSchema>
export type CreateSubscriptionBody = Body<typeof S.createSubscriptionSchema>
export type AddPortfolioMemberBody = Body<typeof S.addMemberSchema>
export type CreatePortfolioBody = Body<typeof S.createPortfolioSchema>
export type CreateCryptoTradeBody = Body<typeof S.createCryptoTradeSchema>
export type CreateMetalLotBody = Body<typeof S.createMetalLotSchema>
export type CreateMetalSaleBody = Body<typeof S.createMetalSaleSchema>
export type CreateStockTradeBody = Body<typeof S.createStockTradeSchema>
export type CreateStockDividendBody = Body<typeof S.createStockDividendSchema>
export type CreateMortgageBody = Body<typeof S.createDebtSchema>
export type AddMortgageMemberBody = Body<typeof S.addMemberSchema>
export type CreateMortgagePartBody = Body<typeof S.createDebtPartSchema>
export type UpdateMortgagePartBody = Body<typeof S.updateDebtPartSchema>
export type CreateMortgageExtraPaymentBody = Body<typeof S.createDebtExtraPaymentSchema>
export type CreateLoanBody = Body<typeof S.createDebtSchema>
export type AddLoanMemberBody = Body<typeof S.addMemberSchema>
export type CreateLoanPartBody = Body<typeof S.createDebtPartSchema>
export type UpdateLoanPartBody = Body<typeof S.updateDebtPartSchema>
export type CreateLoanExtraPaymentBody = Body<typeof S.createDebtExtraPaymentSchema>
