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
  /** crypto/stocks: IBAN or broker account id of the cash account behind the portfolio */
  accountNumber?: string | null
  /** cash in the account on `openingCashDate` (a decimal string) */
  openingCash?: string
  openingCashDate?: string | null
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

/** What a part comes to today, as computed by the server (the amortization simulation). */
export interface PartPreview {
  currentBalance: number
  /** what the next installment is: interest + principal */
  monthlyPayment: number
  monthlyInterest: number
  monthlyPrincipal: number
  /** the installment as scheduled, before extra payments */
  originalMonthlyPayment: number
  /** scheduled number of installments, how many are due by today, how many are left */
  totalMonths: number
  monthsElapsed: number
  monthsRemaining: number
  projectedEndDate: string
  /** interest of a partial first month that was added to the loan (0 without a first payment date) */
  capitalizedInterest: number
}

// ─── Cash account of a crypto/stocks portfolio ─────────────────────────────

export type CashMovementType = "deposit" | "withdrawal" | "fee" | "interest"

export interface CashMovement {
  id: string
  portfolioId: string
  movementDate: string
  type: CashMovementType
  /** always positive; the type gives the direction */
  amount: string
  notes: string | null
  createdAt: string
}

/** What a crypto/stocks portfolio reports about its cash account (the read model adds these to the detail). */
export interface PortfolioCash {
  /** opening cash + deposits − withdrawals − fees + interest − buys + sells (+ dividends for stocks) */
  cash: number
  cashMovements: CashMovement[]
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
  totalCost: number
  realizedPnL: number
  currentPrice: number | null
  currentValue: number | null
  unrealizedPnL: number | null
}

export interface PortfolioDetail extends Portfolio, PortfolioCash {
  trades: CryptoTrade[]
  positions: AssetPosition[]
  totalOpenCost: number
  totalCurrentValue: number | null
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
  totalCost: number
  realizedPnL: number
  currentPrice: number | null
  currentValue: number | null
  unrealizedPnL: number | null
  totalDividends: number
}

export interface StockPortfolioDetail extends Portfolio, PortfolioCash {
  trades: StockTrade[]
  dividends: StockDividend[]
  positions: StockPosition[]
  totalOpenCost: number
  totalCurrentValue: number | null
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
  /** set when the first installment is more than a month after the payout */
  firstPaymentDate?: string | null
  createdAt: string
  extraPayments: MortgageExtraPayment[]
  /** rate changes after the part's own rate (ends of fixed-rate periods), by date */
  rates: PartRate[]
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
  /** the rate the next installment is calculated with, and the next change after it (if one is entered) */
  currentRate?: { annualInterestRate: string; rateType: "nominal" | "effective" }
  nextRateChange?: { effectiveDate: string; annualInterestRate: string; rateType: "nominal" | "effective" } | null
}

/** A rate change of a part: from `effectiveDate` on (the end of a fixed-rate period) it runs at this rate. */
export interface PartRate {
  id: string
  partId: string
  effectiveDate: string
  annualInterestRate: string
  rateType: "nominal" | "effective"
  createdAt: string
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
  firstPaymentDate?: string | null
  createdAt: string
  extraPayments: LoanExtraPayment[]
  rates: PartRate[]
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
  /** the rate the next installment is calculated with, and the next change after it (if one is entered) */
  currentRate?: { annualInterestRate: string; rateType: "nominal" | "effective" }
  nextRateChange?: { effectiveDate: string; annualInterestRate: string; rateType: "nominal" | "effective" } | null
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
  properties: AdminSharingEntry[]
  equity: AdminSharingEntry[]
}

// ─── Property ───────────────────────────────────────────────────────────────

export type PropertyType = "house" | "apartment" | "land" | "vehicle" | "business" | "other"

/** A dated, manually entered estimate of what a property is worth. */
export interface PropertyValuation {
  id: string
  propertyId: string
  valuationDate: string
  value: string
  note: string | null
  createdAt: string
}

/** A mortgage or loan financing a property, with what is still owed (as computed from its parts). */
export interface PropertyLiability {
  kind: "mortgage" | "loan"
  id: string
  name: string
  balance: number
  monthlyPayment: number
}

export interface Property {
  id: string
  name: string
  type: PropertyType
  ownerSub: string | null
  currency: string
  purchasePrice: string | null
  purchaseDate: string | null
  createdAt: string
}

/**
 * A property as the API returns it. `currentValue` is the latest valuation dated today or earlier
 * (flat until the next one), else the purchase price, else null. Only the linked liabilities the
 * requesting user may see are included, so `debt` and `equity` cover those.
 */
export interface PropertyWithDetails extends Property {
  valuations: PropertyValuation[]
  currentValue: number | null
  currentValueDate: string | null
  /** current value minus purchase price (null without both) */
  gainSincePurchase: number | null
  liabilities: PropertyLiability[]
  /** sum of the linked liabilities' outstanding balances */
  debt: number
  /** current value minus debt (null when the value is unknown) */
  equity: number | null
  members: PortfolioMember[]
  isOwner: boolean
  canEdit: boolean
}

// ─── Equity compensation ────────────────────────────────────────────────────

export type VestingType = "time" | "exit"

export interface EquityPrice {
  id: string
  planId: string
  priceDate: string
  price: string
  note: string | null
  createdAt: string
}

/** One grant with what it is worth today. Options are counts; values are in the plan's currency. */
export interface EquityGrantWithState {
  id: string
  planId: string
  label: string | null
  grantDate: string
  options: string
  strikePrice: string
  vestingType: VestingType
  vestStart: string | null
  cliffMonths: number
  vestMonths: number | null
  createdAt: string
  /** options vested today (always 0 for exit-only grants) */
  vested: number
  /** options not vested yet that vest over time (0 for exit-only grants) */
  unvested: number
  /** options that only vest on an exit (0 for time-vested grants) */
  onExit: number
  /** the next date more options vest, null when fully vested or exit-only */
  nextVestingDate: string | null
  /** max(0, price − strike) with the current price; null without a price */
  valuePerOption: number | null
  vestedValue: number | null
  unvestedValue: number | null
  onExitValue: number | null
}

export interface EquityPlanWithDetails {
  id: string
  name: string
  ownerSub: string | null
  currency: string
  createdAt: string
  prices: EquityPrice[]
  /** latest share price dated today or earlier, flat until the next; null without one */
  currentPrice: number | null
  currentPriceDate: string | null
  grants: EquityGrantWithState[]
  totals: {
    granted: number
    vested: number
    unvested: number
    onExit: number
    /** counts in net worth: vested options × (price − strike) */
    vestedValue: number | null
    unvestedValue: number | null
    onExitValue: number | null
  }
  members: PortfolioMember[]
  isOwner: boolean
  canEdit: boolean
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
export type UpdatePortfolioBody = Body<typeof S.updatePortfolioSchema>
export type PreviewDebtPartBody = Body<typeof S.previewDebtPartSchema>
export type CreateDebtRateBody = Body<typeof S.createDebtRateSchema>
export type CreateCashMovementBody = Body<typeof S.createCashMovementSchema>
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
export type CreateEquityPlanBody = Body<typeof S.createEquityPlanSchema>
export type UpdateEquityPlanBody = Body<typeof S.updateEquityPlanSchema>
export type CreateEquityGrantBody = Body<typeof S.createEquityGrantSchema>
export type UpdateEquityGrantBody = Body<typeof S.updateEquityGrantSchema>
export type CreateEquityPriceBody = Body<typeof S.createEquityPriceSchema>
export type CreatePropertyBody = Body<typeof S.createPropertySchema>
export type UpdatePropertyBody = Body<typeof S.updatePropertySchema>
export type CreatePropertyValuationBody = Body<typeof S.createPropertyValuationSchema>
export type SetPropertyLinksBody = Body<typeof S.setPropertyLinksSchema>

// ─── Price history ──────────────────────────────────────────────────────────

export type HistoryRange = "1m" | "3m" | "6m" | "1y" | "max"

/** One point of a price history: `t` is a Unix timestamp in milliseconds, `v` the price per unit. */
export interface PricePoint {
  t: number
  v: number
}

/** Price per unit over time. `points` is empty when no history is available for the symbol. */
export interface PriceHistory {
  symbol: string
  currency: "EUR" | "USD"
  range: HistoryRange
  points: PricePoint[]
}
