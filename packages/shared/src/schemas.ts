/**
 * Request-body schemas — the single source of truth for what the API accepts.
 *
 * The backend validates incoming JSON against these (see `validateJson` in the
 * backend), and the matching `*Body` TypeScript types in `types.ts` are derived
 * from them with `z.input`, so frontend and backend can never drift apart.
 */
import { z } from "zod"

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Trimmed, non-empty string. */
const requiredString = (what: string, max = 200) =>
  z.string({ error: `${what} is required` }).trim().min(1, `${what} is required`).max(max, `${what} is too long`)

/** Trimmed string where an empty value means "not set". */
const optionalText = (max = 2000) => z.string().trim().max(max).optional()

/** Decimal number encoded as a string, as stored in Postgres `numeric` columns. */
const DECIMAL = /^-?\d+(\.\d+)?$/

/** Any decimal string (may be negative or zero). */
export const decimalString = (what: string) =>
  z.string({ error: `${what} is required` }).trim().regex(DECIMAL, `${what} must be a decimal number`)

/** Decimal string that must be > 0. */
export const positiveDecimalString = (what: string) =>
  decimalString(what).refine((v) => parseFloat(v) > 0, `${what} must be greater than 0`)

/** Decimal string that must be >= 0. */
export const nonNegativeDecimalString = (what: string) =>
  decimalString(what).refine((v) => parseFloat(v) >= 0, `${what} must not be negative`)

/** Calendar date `YYYY-MM-DD` that actually exists (rejects 2024-02-31). */
export const isoDate = (what: string) =>
  z
    .string({ error: `${what} is required` })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${what} must be a date (YYYY-MM-DD)`)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    }, `${what} is not a valid date`)

export const currencySchema = z.enum(["EUR", "USD"], { error: "currency must be EUR or USD" })
export const memberRoleSchema = z.enum(["viewer", "editor"], { error: "role must be viewer or editor" })
export const amortizationTypeSchema = z.enum(["linear", "annuity", "interest_only"], {
  error: "type must be linear, annuity, or interest_only",
})

/** Ticker / currency code, normalised to upper case. */
const symbol = (what: string) =>
  requiredString(what, 30).transform((s) => s.toUpperCase())

// ─── Shared building blocks ──────────────────────────────────────────────────

export const addMemberSchema = z.object({
  groupName: requiredString("groupName"),
  role: memberRoleSchema.optional(),
})

// ─── Accounts / transactions / categories ────────────────────────────────────

export const accountTypeSchema = z.enum(["checking", "savings", "cash"], { error: "type must be checking, savings or cash" })

/** An account entered by hand (no bank export, or cash in the house). The IBAN is optional. */
export const createAccountSchema = z.object({
  name: requiredString("name"),
  type: accountTypeSchema.default("checking"),
  currency: currencySchema.default("EUR"),
  iban: z.string().trim().max(50).optional(),
  openingBalance: decimalString("openingBalance").optional(),
  openingBalanceDate: isoDate("openingBalanceDate").nullable().optional(),
})

/** A transaction entered by hand. `amount` is always positive; `direction` says whether money came in or went out. */
export const createTransactionSchema = z.object({
  accountId: z.uuid("accountId must be a UUID"),
  bookingDate: isoDate("bookingDate"),
  direction: z.enum(["CRDT", "DBIT"], { error: "direction must be CRDT (money in) or DBIT (money out)" }),
  amount: positiveDecimalString("amount"),
  description: optionalText(500),
  counterpartyName: optionalText(200),
  counterpartyIban: optionalText(50),
  categoryId: z.uuid("categoryId must be a UUID").nullable().optional(),
})

/** Editing a manual transaction (the account cannot change: delete and re-enter it instead). */
export const updateManualTransactionSchema = createTransactionSchema.omit({ accountId: true }).partial()

export const updateAccountSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    type: accountTypeSchema.optional(),
    openingBalance: decimalString("openingBalance").optional(),
    openingBalanceDate: isoDate("openingBalanceDate").nullable().optional(),
  })

export const updateTransactionSchema = z.object({
  categoryId: z.uuid("categoryId must be a UUID").nullable(),
})

export const linkTransferSchema = z.object({
  peerId: z.uuid("peerId must be a UUID"),
})

export const createCategorySchema = z.object({
  name: requiredString("name"),
  color: z.string().trim().max(50).optional(),
  parentId: z.uuid("parentId must be a UUID").optional(),
})

export const updateCategorySchema = createCategorySchema.partial()

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const createSubscriptionSchema = z.object({
  accountId: z.uuid("accountId must be a UUID"),
  counterpartyIban: requiredString("counterpartyIban", 50),
  name: optionalText(200),
})

export const updateSubscriptionSchema = z.object({
  name: z.string().trim().max(200).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(["confirmed", "dismissed"]).optional(),
})

// ─── Profile / admin ─────────────────────────────────────────────────────────

export const updateMeSchema = z.object({
  theme: z.enum(["light", "dark", "system"], { error: "Invalid theme value" }).optional(),
})

/** The standalone (local) app's own settings that can be changed from the UI. */
export const localSettingsSchema = z.object({
  backupDir: z.string({ error: "Enter a folder" }).trim().min(1, "Enter a folder"),
})

export const unlockSchema = z.object({ password: z.string({ error: "Enter the password" }).min(1, "Enter the password").max(500) })

/** Set the password of the standalone app, or change it (then `currentPassword` is needed). */
export const setPasswordSchema = z.object({
  password: z.string({ error: "Enter a password" }).min(8, "Use at least 8 characters").max(500, "That password is too long"),
  currentPassword: z.string().max(500).optional(),
})

export const removePasswordSchema = z.object({ currentPassword: z.string({ error: "Enter the current password" }).min(1, "Enter the current password").max(500) })

export const setAccountOwnerSchema = z.object({
  ownerSub: z.string().trim().min(1).nullable(),
})

// ─── Portfolios (crypto | metals | stocks) ───────────────────────────────────

export const createPortfolioSchema = z.object({
  name: requiredString("name"),
  currency: currencySchema.optional(),
  broker: z.string().trim().max(100).optional(), // stocks only
  accountNumber: z.string().trim().max(100).optional(), // crypto/stocks: IBAN or broker account id of the cash account
})

export const updatePortfolioSchema = z
  .object({
    name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
    currency: currencySchema.optional(),
    broker: z.string().trim().max(100).nullable().optional(),
    accountNumber: z.string().trim().max(100).nullable().optional(),
    /** cash in the account on `openingCashDate`; movements and trades from that date on are added to it */
    openingCash: nonNegativeDecimalString("openingCash").optional(),
    openingCashDate: isoDate("openingCashDate").nullable().optional(),
  })
  .refine((p) => p.openingCash === undefined || Number(p.openingCash) === 0 || !!p.openingCashDate, {
    message: "openingCashDate is required with an opening cash amount",
    path: ["openingCashDate"],
  })

export const CASH_MOVEMENT_TYPES = ["deposit", "withdrawal", "fee", "interest"] as const
/** A deposit or withdrawal of the cash account of a crypto/stocks portfolio, or a fee/interest charged on it. */
export const createCashMovementSchema = z.object({
  movementDate: isoDate("movementDate"),
  type: z.enum(CASH_MOVEMENT_TYPES, { error: `type must be one of ${CASH_MOVEMENT_TYPES.join(", ")}` }),
  amount: positiveDecimalString("amount"),
  notes: optionalText(),
})

export const createCryptoTradeSchema = z
  .object({
    tradeDate: isoDate("tradeDate"),
    fromSymbol: symbol("fromSymbol"),
    fromAmount: positiveDecimalString("fromAmount"),
    toSymbol: symbol("toSymbol"),
    toAmount: positiveDecimalString("toAmount"),
    baseCurrencyAmount: nonNegativeDecimalString("baseCurrencyAmount").optional(),
    assetName: optionalText(200),
    notes: optionalText(),
  })
  .refine((t) => t.fromSymbol !== t.toSymbol, {
    message: "fromSymbol and toSymbol must differ",
    path: ["toSymbol"],
  })

export const createMetalLotSchema = z.object({
  purchaseDate: isoDate("purchaseDate"),
  metal: requiredString("metal", 50),
  itemName: optionalText(200),
  itemForm: optionalText(100),
  weightPerPiece: positiveDecimalString("weightPerPiece"),
  unit: z.enum(["g", "oz"], { error: "unit must be g or oz" }).optional(),
  quantity: z.number().positive("quantity must be greater than 0").optional(),
  pricePerPiece: nonNegativeDecimalString("pricePerPiece"),
  notes: optionalText(),
})

export const createMetalSaleSchema = z.object({
  saleDate: isoDate("saleDate"),
  quantitySold: z.number({ error: "quantitySold is required" }).positive("quantitySold must be greater than 0"),
  totalReceived: nonNegativeDecimalString("totalReceived"),
  notes: optionalText(),
})

export const createStockTradeSchema = z.object({
  tradeDate: isoDate("tradeDate"),
  type: z.enum(["buy", "sell"], { error: "type must be buy or sell" }),
  symbol: symbol("symbol"),
  quantity: positiveDecimalString("quantity"),
  amount: positiveDecimalString("amount"),
  assetName: optionalText(200),
  notes: optionalText(),
})

export const createStockDividendSchema = z.object({
  symbol: symbol("symbol"),
  paymentDate: isoDate("paymentDate"),
  amount: positiveDecimalString("amount"),
  notes: optionalText(),
})

// ─── Mortgages & loans (identical structure) ─────────────────────────────────

export const createDebtSchema = z.object({
  name: requiredString("name"),
  currency: currencySchema.optional(),
})

export const updateDebtSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
  currency: currencySchema.optional(),
})

export const rateTypeSchema = z.enum(["nominal", "effective"], { error: "rateType must be nominal or effective" })

/** From `effectiveDate` on (the end of a fixed-rate period) the part runs at this rate. */
export const createDebtRateSchema = z.object({
  effectiveDate: isoDate("effectiveDate"),
  annualInterestRate: nonNegativeDecimalString("annualInterestRate"),
  rateType: rateTypeSchema.optional(),
})

export const resetRecalculationSchema = z.enum(["contract", "remaining"], { error: "resetRecalculation must be contract or remaining" })

const debtPartFields = {
  name: requiredString("name"),
  type: amortizationTypeSchema,
  principal: positiveDecimalString("principal"),
  annualInterestRate: nonNegativeDecimalString("annualInterestRate"),
  rateType: rateTypeSchema.optional(),
  startDate: isoDate("startDate"),
  endDate: isoDate("endDate"),
  /** the first installment, when it is more than a month after the payout (the partial month's interest is added to the loan) */
  firstPaymentDate: isoDate("firstPaymentDate").optional(),
  /** rate changes after the part's own rate: the ends of its fixed-rate periods */
  rates: z.array(createDebtRateSchema).max(50).optional(),
  /** at a rate change an annuity is recalculated over the months left in the contract (default) or over the term that remains after extra payments */
  resetRecalculation: resetRecalculationSchema.optional(),
}

type PartDates = { startDate: string; endDate: string; firstPaymentDate?: string; rates?: Array<{ effectiveDate: string }> }
const ratesFit = (p: PartDates) => {
  const dates = (p.rates ?? []).map((r) => r.effectiveDate)
  return dates.every((d) => d > p.startDate && d <= p.endDate) && new Set(dates).size === dates.length
}
const RATES_MESSAGE = { message: "rate changes must fall within the term, one per date", path: ["rates"] }

export const createDebtPartSchema = z
  .object(debtPartFields)
  .refine((p) => p.endDate > p.startDate, { message: "endDate must be after startDate", path: ["endDate"] })
  .refine((p) => !p.firstPaymentDate || p.firstPaymentDate > p.startDate, { message: "firstPaymentDate must be after startDate", path: ["firstPaymentDate"] })
  .refine((p) => !p.firstPaymentDate || p.endDate >= p.firstPaymentDate, { message: "endDate must not be before the first payment", path: ["endDate"] })
  .refine(ratesFit, RATES_MESSAGE)

/** What the "preview a part" endpoint takes: a part as it is being entered, without a name (nothing is saved). */
export const previewDebtPartSchema = z
  .object({ ...debtPartFields, name: z.string().optional() })
  .refine((p) => p.endDate > p.startDate, { message: "endDate must be after startDate", path: ["endDate"] })
  .refine((p) => !p.firstPaymentDate || p.firstPaymentDate > p.startDate, { message: "firstPaymentDate must be after startDate", path: ["firstPaymentDate"] })
  .refine((p) => !p.firstPaymentDate || p.endDate >= p.firstPaymentDate, { message: "endDate must not be before the first payment", path: ["endDate"] })
  .refine(ratesFit, RATES_MESSAGE)

export const updateDebtPartSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
  annualInterestRate: nonNegativeDecimalString("annualInterestRate").optional(),
  rateType: rateTypeSchema.optional(),
  endDate: isoDate("endDate").optional(),
  resetRecalculation: resetRecalculationSchema.optional(),
})

/**
 * Closing a part on the day its fixed-rate period ends: what is left of it is continued in new parts (which
 * start that day) and whatever is not continued counts as repaid.
 */
export const closeDebtPartSchema = z.object({
  closedOn: isoDate("closedOn"),
  continuation: z
    .array(
      z.object({
        name: requiredString("name"),
        type: amortizationTypeSchema,
        principal: positiveDecimalString("principal"),
        annualInterestRate: nonNegativeDecimalString("annualInterestRate"),
        rateType: rateTypeSchema.optional(),
        endDate: isoDate("endDate"),
        firstPaymentDate: isoDate("firstPaymentDate").optional(),
        rates: z.array(createDebtRateSchema).max(50).optional(),
        resetRecalculation: resetRecalculationSchema.optional(),
      }),
    )
    .max(10)
    .default([]),
})

/** GET …/carry-over?date=: what is left of a part on a day. */
export const carryOverQuerySchema = z.object({ date: isoDate("date") })

export const EXTRA_PAYMENT_EFFECTS = ["shorten_term", "lower_payment"] as const

export const createDebtExtraPaymentSchema = z.object({
  paymentDate: isoDate("paymentDate"),
  amount: positiveDecimalString("amount"),
  /** what the extra payment does: keep the installment and end earlier (default), or lower the installment and keep the end date */
  effect: z.enum(EXTRA_PAYMENT_EFFECTS, { error: `effect must be one of ${EXTRA_PAYMENT_EFFECTS.join(", ")}` }).optional(),
  notes: optionalText(),
})

// ─── Price history (GET /crypto/history/:symbol, /stocks/history/:symbol) ───────

export const HISTORY_RANGES = ["1m", "3m", "6m", "1y", "max"] as const
export const historyQuerySchema = z.object({
  range: z.enum(HISTORY_RANGES, { error: `range must be one of ${HISTORY_RANGES.join(", ")}` }).default("1y"),
  currency: z.enum(["EUR", "USD"], { error: "currency must be EUR or USD" }).default("EUR"),
})

// ─── Property (house, car, business share, …) ───────────────────────────────

export const PROPERTY_TYPES = ["house", "apartment", "land", "vehicle", "business", "other"] as const
export const propertyTypeSchema = z.enum(PROPERTY_TYPES, { error: `type must be one of ${PROPERTY_TYPES.join(", ")}` })

export const createPropertySchema = z.object({
  name: requiredString("name"),
  type: propertyTypeSchema.optional(),
  currency: currencySchema.optional(),
  purchasePrice: positiveDecimalString("purchasePrice").optional(),
  purchaseDate: isoDate("purchaseDate").optional(),
  /** today's value: recorded as a first valuation dated today */
  currentValue: positiveDecimalString("currentValue").optional(),
})

export const updatePropertySchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
  type: propertyTypeSchema.optional(),
  purchasePrice: positiveDecimalString("purchasePrice").nullable().optional(),
  purchaseDate: isoDate("purchaseDate").nullable().optional(),
})

export const createPropertyValuationSchema = z.object({
  valuationDate: isoDate("valuationDate"),
  value: positiveDecimalString("value"),
  note: optionalText(200),
})

/** Replaces the links between a property and the mortgages/loans that finance it. */
export const setPropertyLinksSchema = z.object({
  mortgageIds: z.array(z.uuid({ error: "mortgageIds must be ids" })).default([]),
  loanIds: z.array(z.uuid({ error: "loanIds must be ids" })).default([]),
})

// ─── Equity compensation (stock options) ───────────────────────────────────

export const VESTING_TYPES = ["time", "exit"] as const
export const vestingTypeSchema = z.enum(VESTING_TYPES, { error: "vestingType must be time or exit" })

const wholeMonths = (what: string, min: number) =>
  z.number({ error: `${what} must be a number` }).int(`${what} must be a whole number`).min(min, `${what} must be at least ${min}`).max(1200, `${what} is too large`)

const equityGrantFields = {
  label: optionalText(200),
  grantDate: isoDate("grantDate"),
  options: positiveDecimalString("options"),
  strikePrice: nonNegativeDecimalString("strikePrice"),
  vestingType: vestingTypeSchema.optional(),
  /** time vesting: when vesting starts (usually the grant date), the cliff and the total months until fully vested */
  vestStart: isoDate("vestStart").optional(),
  cliffMonths: wholeMonths("cliffMonths", 0).optional(),
  vestMonths: wholeMonths("vestMonths", 1).optional(),
}

/** Time-vested grants need a vesting start and duration (the cliff cannot be longer than that). */
const checkVesting = (g: { vestingType?: "time" | "exit"; vestStart?: string; vestMonths?: number; cliffMonths?: number }, ctx: z.RefinementCtx) => {
  if ((g.vestingType ?? "time") !== "time") return
  if (!g.vestStart) ctx.addIssue({ code: "custom", path: ["vestStart"], message: "vestStart is required for time vesting" })
  if (g.vestMonths === undefined) ctx.addIssue({ code: "custom", path: ["vestMonths"], message: "vestMonths is required for time vesting" })
  else if ((g.cliffMonths ?? 0) > g.vestMonths) ctx.addIssue({ code: "custom", path: ["cliffMonths"], message: "cliffMonths cannot be longer than vestMonths" })
}

export const createEquityPlanSchema = z.object({ name: requiredString("name"), currency: currencySchema.optional() })
export const updateEquityPlanSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
  currency: currencySchema.optional(),
})
export const createEquityGrantSchema = z.object(equityGrantFields).superRefine(checkVesting)
export const updateEquityGrantSchema = z.object(Object.fromEntries(Object.entries(equityGrantFields).map(([k, v]) => [k, (v as z.ZodType).optional()])) as { [K in keyof typeof equityGrantFields]: z.ZodOptional<(typeof equityGrantFields)[K]> })
export const createEquityPriceSchema = z.object({
  priceDate: isoDate("priceDate"),
  price: positiveDecimalString("price"),
  note: optionalText(200),
})

// ─── Transaction list filters (GET /transactions?…) ─────────────────────────────

/** Query strings give "" for an unset field: treat it as absent. */
const emptyAsUndefined = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema)
const id = (what: string) => z.uuid({ error: `${what} must be an id` })

export const MAX_PAGE_SIZE = 200
export const transactionFiltersSchema = z
  .object({
    accountId: emptyAsUndefined(id("accountId").optional()),
    /** several accounts: comma-separated ids */
    accountIds: emptyAsUndefined(
      z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)).pipe(z.array(id("accountIds")).max(100, "accountIds has too many ids")).optional(),
    ),
    categoryId: emptyAsUndefined(
      z.string().refine((v) => v === "uncategorized" || z.uuid().safeParse(v).success, { message: 'categoryId must be an id or "uncategorized"' }).optional(),
    ),
    from: emptyAsUndefined(isoDate("from").optional()),
    to: emptyAsUndefined(isoDate("to").optional()),
    search: emptyAsUndefined(z.string().trim().max(200, "search is too long").optional()),
    page: emptyAsUndefined(z.coerce.number({ error: "page must be a number" }).int("page must be a whole number").min(1, "page must be at least 1").default(1)),
    /** more than MAX_PAGE_SIZE is not an error: it is capped */
    pageSize: emptyAsUndefined(
      z.coerce.number({ error: "pageSize must be a number" }).int("pageSize must be a whole number").min(1, "pageSize must be at least 1").transform((n) => Math.min(n, MAX_PAGE_SIZE)).default(50),
    ),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, { message: "from must not be after to", path: ["from"] })
