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

export const updateAccountSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    type: z.enum(["checking", "savings"]).optional(),
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

export const setAccountOwnerSchema = z.object({
  ownerSub: z.string().trim().min(1).nullable(),
})

// ─── Portfolios (crypto | metals | stocks) ───────────────────────────────────

export const createPortfolioSchema = z.object({
  name: requiredString("name"),
  currency: currencySchema.optional(),
  broker: z.string().trim().max(100).optional(), // stocks only
})

export const updatePortfolioSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
  currency: currencySchema.optional(),
  broker: z.string().trim().max(100).nullable().optional(),
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

export const createDebtPartSchema = z
  .object({
    name: requiredString("name"),
    type: amortizationTypeSchema,
    principal: positiveDecimalString("principal"),
    annualInterestRate: nonNegativeDecimalString("annualInterestRate"),
    startDate: isoDate("startDate"),
    endDate: isoDate("endDate"),
  })
  .refine((p) => p.endDate > p.startDate, { message: "endDate must be after startDate", path: ["endDate"] })

export const updateDebtPartSchema = z.object({
  name: z.string().trim().min(1, "name must not be empty").max(200).optional(),
  annualInterestRate: nonNegativeDecimalString("annualInterestRate").optional(),
  endDate: isoDate("endDate").optional(),
})

export const createDebtExtraPaymentSchema = z.object({
  paymentDate: isoDate("paymentDate"),
  amount: positiveDecimalString("amount"),
  notes: optionalText(),
})
