import type { z } from "zod"
import type * as S from "./schemas"

export type CreditDebitIndicator = "CRDT" | "DBIT"

/** The balance at the end of a day with transactions (computed on request). */
export interface BalanceHistory {
  currency: string
  points: Array<{ date: string; balance: string }>
}

export interface Account {
  id: string
  iban: string
  name: string | null
  currency: string
  type: "checking" | "savings" | "cash"
  /** "manual": entered by hand; its iban may be a "manual:…" placeholder (see `hasRealIban`) */
  source: "import" | "manual"
  openingBalance: string
  openingBalanceDate: string | null
  balance: string
  /** who it belongs to (a label for grouping a family's accounts), null when not set */
  holder: string | null
  /** closed or no longer followed: kept, but tucked away in the lists */
  hidden: boolean
  ownerSub: string | null
  createdAt: string
}

/** Manual accounts without an IBAN carry a "manual:<id>" placeholder; show the name only. */
export const hasRealIban = (a: { iban: string }) => !a.iban.startsWith("manual:")

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
  /** entered by hand: can be edited and deleted */
  isManual: boolean
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

/** What is left of a part on a day (`GET …/carry-over`). */
export interface PartCarryOver {
  date: string
  balance: number
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
  /** what the extra payment does: keep the installment and end earlier, or lower the installment and keep the end date */
  effect?: "shorten_term" | "lower_payment"
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
  /** at a rate change an annuity is recalculated over the months left in the contract, or over the term that remains after extra payments */
  resetRecalculation?: "contract" | "remaining"
  /** the day the part stopped being a liability (its remainder was continued in other parts and/or repaid) */
  closedOn?: string | null
  /** set on a part that continues the remainder of another part */
  continuesPartId?: string | null
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
  /** what was (or will be) left of a closed part on the day it was closed */
  carriedOver?: number | null
  /** interest of a partial first month that was added to the loan */
  capitalizedInterest?: number
  /** what the extra payments made so far saved (null without any, or on a closed part) */
  extraImpact?: ExtraPaymentImpact | null
}

/** Net worth on one day in EUR, split into what it is made of (computed on request). Investments are valued at cost. */
export interface NetWorthPoint {
  date: string
  banking: number
  investments: number
  property: number
  pensions: number
  debts: number
  netWorth: number
}

export interface NetWorthHistory {
  currency: "EUR"
  points: NetWorthPoint[]
}

/** The balance of a mortgage or loan over its life, month by month (computed on request). */
export interface DebtSchedule {
  currency: string
  /** today (UTC): points up to here are what happened, later ones a projection */
  today: string
  actual: Array<{ date: string; balance: number }>
  /** the course without extra payments; null when there are none */
  scheduled: Array<{ date: string; balance: number }> | null
}

/** What the extra payments made so far are worth: the part run to its end with them and as if they had never been made. */
export interface ExtraPaymentImpact {
  count: number
  totalExtra: number
  interestWithExtra: number
  interestWithoutExtra: number
  /** how much of each has been paid up to today */
  interestPaidToDate: number
  interestPaidToDateWithoutExtra: number
  interestSaved: number
  monthsSaved: number
  /** date of the last payment with the extra payments, and without them */
  endDate: string
  endDateWithoutExtra: string
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
  /** what the extra payment does: keep the installment and end earlier, or lower the installment and keep the end date */
  effect?: "shorten_term" | "lower_payment"
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
  /** at a rate change an annuity is recalculated over the months left in the contract, or over the term that remains after extra payments */
  resetRecalculation?: "contract" | "remaining"
  /** the day the part stopped being a liability (its remainder was continued in other parts and/or repaid) */
  closedOn?: string | null
  /** set on a part that continues the remainder of another part */
  continuesPartId?: string | null
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
  /** what was (or will be) left of a closed part on the day it was closed */
  carriedOver?: number | null
  /** interest of a partial first month that was added to the loan */
  capitalizedInterest?: number
  /** what the extra payments made so far saved (null without any, or on a closed part) */
  extraImpact?: ExtraPaymentImpact | null
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
  pensions: AdminSharingEntry[]
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

// ─── Pensions ───────────────────────────────────────────────────────────────

export type PensionKind = "state" | "occupational_db" | "occupational_dc" | "personal"
/** `closed` is derived from `closedOn` being today or earlier */
export type PensionState = "active" | "frozen" | "closed"

export interface PensionStatement {
  id: string
  planId: string
  statementDate: string
  capital: string | null
  accruedIncome: string | null
  projectedLow: string | null
  projectedExpected: string | null
  projectedHigh: string | null
  partnerIncome: string | null
  inTodaysMoney: boolean
  note: string | null
  createdAt: string
}

export interface PensionTransfer {
  id: string
  fromPlanId: string
  toPlanId: string
  /** names of the plans on either side, null when the user cannot see (or no longer has) that plan */
  fromPlanName: string | null
  toPlanName: string | null
  transferDate: string
  kind: "transfer" | "conversion"
  capital: string | null
  incomeGivenUp: string | null
  note: string | null
  createdAt: string
}

export interface PensionPlanWithDetails {
  id: string
  name: string
  provider: string | null
  kind: PensionKind
  /** stored status, active or frozen; see `state` for what it is today */
  status: "active" | "frozen"
  state: PensionState
  closedOn: string | null
  ownerSub: string | null
  currency: string
  retirementDate: string | null
  countInNetWorth: boolean
  createdAt: string
  /** oldest first */
  statements: PensionStatement[]
  /** the latest statement dated today or earlier; the figures below come from it */
  latestStatement: PensionStatement | null
  capital: number | null
  accruedIncome: number | null
  /** yearly income at retirement: the expected scenario, else what is accrued */
  expectedIncome: number | null
  incomeLow: number | null
  incomeHigh: number | null
  partnerIncome: number | null
  /** whether the income figures are in today's euros (false: nominal) */
  incomeInTodaysMoney: boolean
  /** what this plan adds to net worth: its capital when it counts and is not closed, else 0 */
  netWorthValue: number
  transfers: PensionTransfer[]
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
export type CreateAccountBody = Body<typeof S.createAccountSchema>
export type CreateTransactionBody = Body<typeof S.createTransactionSchema>
export type UpdateManualTransactionBody = Body<typeof S.updateManualTransactionSchema>
export type UpdateAccountBody = Body<typeof S.updateAccountSchema>
export type CreateCategoryBody = Body<typeof S.createCategorySchema>
export type UpdateSubscriptionBody = Body<typeof S.updateSubscriptionSchema>
export type CreateSubscriptionBody = Body<typeof S.createSubscriptionSchema>
export type AddPortfolioMemberBody = Body<typeof S.addMemberSchema>
export type CreatePortfolioBody = Body<typeof S.createPortfolioSchema>
export type UpdatePortfolioBody = Body<typeof S.updatePortfolioSchema>
export type PreviewDebtPartBody = Body<typeof S.previewDebtPartSchema>
export type CreateDebtRateBody = Body<typeof S.createDebtRateSchema>
export type CloseDebtPartBody = Body<typeof S.closeDebtPartSchema>
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
export type CreatePensionPlanBody = Body<typeof S.createPensionPlanSchema>
export type UpdatePensionPlanBody = Body<typeof S.updatePensionPlanSchema>
export type CreatePensionStatementBody = Body<typeof S.createPensionStatementSchema>
export type CreatePensionTransferBody = Body<typeof S.createPensionTransferSchema>
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

/** The standalone (local) app's settings: `GET /api/local/settings`. */
export interface LocalSettings {
  /** where "Back up now" writes its files */
  backupDir: string
  /** the folder used when none is chosen */
  defaultBackupDir: string
  configFile: string
  dataDir: string
}
/** `GET /api/local/auth/status` */
export interface LockStatus {
  passwordSet: boolean
  unlocked: boolean
}
export type UnlockBody = Body<typeof S.unlockSchema>
export type SetPasswordBody = Body<typeof S.setPasswordSchema>
export type RemovePasswordBody = Body<typeof S.removePasswordSchema>
export type LocalSettingsBody = z.input<typeof S.localSettingsSchema>
/** `POST /api/local/backup`: the file that was written. */
export interface SavedBackup {
  path: string
  bytes: number
}
