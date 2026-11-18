import { type AnyPgColumn, index, pgTable, uuid, text, numeric, date, timestamp, integer, boolean, primaryKey } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  iban: text("iban").notNull().unique(),
  name: text("name"),
  currency: text("currency").notNull(),
  type: text("type").notNull().default("checking"),  // "checking" | "savings"
  openingBalance: numeric("opening_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  openingBalanceDate: date("opening_balance_date"),   // date from which openingBalance is valid
  ownerSub: text("owner_sub"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ accounts_owner_idx: index("accounts_owner_idx").on(t.ownerSub) }))

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color"),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  name: text("name"),
  counterpartyIban: text("counterparty_iban").notNull(),
  counterpartyName: text("counterparty_name"),
  medianAmount: numeric("median_amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  intervalDays: integer("interval_days"),
  intervalLabel: text("interval_label"), // weekly | bi-weekly | monthly | quarterly | yearly | custom
  nextExpectedDate: date("next_expected_date"),
  lastSeenDate: date("last_seen_date"),
  isActive: boolean("is_active").default(true).notNull(),
  status: text("status").notNull().default("confirmed"), // 'candidate' | 'confirmed' | 'dismissed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  creditDebitIndicator: text("credit_debit_indicator").notNull(), // CRDT | DBIT
  bookingDate: date("booking_date").notNull(),
  valueDate: date("value_date"),
  description: text("description"),
  counterpartyName: text("counterparty_name"),
  counterpartyIban: text("counterparty_iban"),
  reference: text("reference"),
  categoryId: uuid("category_id").references(() => categories.id),
  // Links the two legs of an internal transfer between own accounts
  transferPeerId: uuid("transfer_peer_id").references((): AnyPgColumn => transactions.id),
  // Links to a detected recurring subscription
  subscriptionId: uuid("subscription_id").references((): AnyPgColumn => subscriptions.id),
  // Used to deduplicate imports; hash of amount+date+reference+counterparty
  importHash: text("import_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Listing/paging per account, newest first
  accountBooking: index("tx_account_booking_idx").on(t.accountId, t.bookingDate.desc()),
  category: index("tx_category_idx").on(t.categoryId),
  subscription: index("tx_subscription_idx").on(t.subscriptionId),
  transferPeer: index("tx_transfer_peer_idx").on(t.transferPeerId),
  // Transfer linker + subscription detector lookups
  counterpartyIban: index("tx_counterparty_iban_idx").on(t.counterpartyIban),
  reference: index("tx_reference_idx").on(t.reference),
}))

export const userProfiles = pgTable("user_profiles", {
  sub: text("sub").primaryKey(),
  email: text("email"),
  name: text("name"),
  theme: text("theme").notNull().default("system"), // "light" | "dark" | "system"
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const accountMembers = pgTable("account_members", {
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  groupName: text("group_name").notNull(),
  role: text("role").notNull().default("viewer"), // "viewer" | "editor"
}, (t) => ({ pk: primaryKey({ columns: [t.accountId, t.groupName] }), account_members_group_idx: index("account_members_group_idx").on(t.groupName) }))

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // "crypto" | "metals" | "stocks"
  name: text("name").notNull(),
  ownerSub: text("owner_sub"),
  currency: text("currency").notNull().default("EUR"),
  broker: text("broker"), // stocks only — e.g. "DEGIRO", "Trade Republic"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ portfolios_owner_type_idx: index("portfolios_owner_type_idx").on(t.ownerSub, t.type) }))

export const portfolioMembers = pgTable("portfolio_members", {
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  groupName: text("group_name").notNull(),
  role: text("role").notNull().default("viewer"), // "viewer" | "editor"
}, (t) => ({ pk: primaryKey({ columns: [t.portfolioId, t.groupName] }), portfolio_members_group_idx: index("portfolio_members_group_idx").on(t.groupName) }))

// ─── Crypto ────────────────────────────────────────────────────────────────
// Every buy, sell, or swap is one immutable row.
// Buy BTC:  fromSymbol=EUR, fromAmount=10000, toSymbol=BTC, toAmount=0.5
// Sell BTC: fromSymbol=BTC, fromAmount=0.3,  toSymbol=EUR, toAmount=15000
// Swap:     fromSymbol=BTC, fromAmount=0.3,  toSymbol=ETH, toAmount=4.2
// baseCurrencyAmount: always set — the portfolio-currency value of the trade.
//   For buys/sells it equals fromAmount or toAmount respectively.
//   For swaps without user input it is auto-computed as the FIFO cost of the consumed symbol.
export const cryptoTrades = pgTable("crypto_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  tradeDate: date("trade_date").notNull(),
  fromSymbol: text("from_symbol").notNull(),
  fromAmount: numeric("from_amount", { precision: 30, scale: 8 }).notNull(),
  toSymbol: text("to_symbol").notNull(),
  toAmount: numeric("to_amount", { precision: 30, scale: 8 }).notNull(),
  baseCurrencyAmount: numeric("base_currency_amount", { precision: 15, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ crypto_trades_portfolio_idx: index("crypto_trades_portfolio_idx").on(t.portfolioId, t.tradeDate) }))

// Display metadata per (portfolio, symbol)
export const cryptoAssets = pgTable("crypto_assets", {
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  assetForm: text("asset_form"),
}, (t) => ({ pk: primaryKey({ columns: [t.portfolioId, t.symbol] }) }))

// ─── Metals ────────────────────────────────────────────────────────────────
// Physical inventory model: each purchase is a discrete lot of specific items.
// Immutable — create lots and sales, never modify.
export const metalLots = pgTable("metal_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  purchaseDate: date("purchase_date").notNull(),
  metal: text("metal").notNull(),             // "gold" | "silver" | "platinum" | "palladium"
  itemName: text("item_name"),                // "1oz Krugerrand", "1/10oz Brumby"
  itemForm: text("item_form"),                // "coin" | "bar" | "other"
  weightPerPiece: numeric("weight_per_piece", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull().default("g"),  // "g" | "oz"
  quantity: integer("quantity").notNull().default(1),
  pricePerPiece: numeric("price_per_piece", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ metal_lots_portfolio_idx: index("metal_lots_portfolio_idx").on(t.portfolioId) }))

// Records a sale against a specific lot
export const metalSales = pgTable("metal_sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  lotId: uuid("lot_id").notNull().references(() => metalLots.id, { onDelete: "cascade" }),
  saleDate: date("sale_date").notNull(),
  quantitySold: integer("quantity_sold").notNull(),
  totalReceived: numeric("total_received", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ metal_sales_lot_idx: index("metal_sales_lot_idx").on(t.lotId), metal_sales_portfolio_idx: index("metal_sales_portfolio_idx").on(t.portfolioId) }))

// ─── Stocks / ETFs ─────────────────────────────────────────────────────────
// Same immutable ledger + FIFO cost-basis model as crypto. Each portfolio is
// tied to one broker (portfolios.broker); buy/sell only, no swaps.
export const stockTrades = pgTable("stock_trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  tradeDate: date("trade_date").notNull(),
  fromSymbol: text("from_symbol").notNull(),
  fromAmount: numeric("from_amount", { precision: 20, scale: 6 }).notNull(),
  toSymbol: text("to_symbol").notNull(),
  toAmount: numeric("to_amount", { precision: 20, scale: 6 }).notNull(),
  baseCurrencyAmount: numeric("base_currency_amount", { precision: 15, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ stock_trades_portfolio_idx: index("stock_trades_portfolio_idx").on(t.portfolioId, t.tradeDate) }))

// Display metadata per (portfolio, ticker symbol)
export const stockAssets = pgTable("stock_assets", {
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  assetForm: text("asset_form"), // "stock" | "etf"
}, (t) => ({ pk: primaryKey({ columns: [t.portfolioId, t.symbol] }) }))

// Dividend payments — not part of the FIFO cost-basis chain, tracked separately per symbol
export const stockDividends = pgTable("stock_dividends", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ stock_dividends_portfolio_idx: index("stock_dividends_portfolio_idx").on(t.portfolioId) }))

// ─── Mortgages ─────────────────────────────────────────────────────────────
// A mortgage can have multiple parts (common in NL), each with its own type,
// rate, and term. Extra payments reduce the outstanding principal and are
// injected into the month-by-month amortization simulation.
export const mortgages = pgTable("mortgages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerSub: text("owner_sub"),
  currency: text("currency").notNull().default("EUR"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ mortgages_owner_idx: index("mortgages_owner_idx").on(t.ownerSub) }))

export const mortgageParts = pgTable("mortgage_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  mortgageId: uuid("mortgage_id").notNull().references(() => mortgages.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),  // "linear" | "annuity" | "interest_only"
  principal: numeric("principal", { precision: 15, scale: 2 }).notNull(),
  annualInterestRate: numeric("annual_interest_rate", { precision: 8, scale: 6 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ mortgage_parts_mortgage_idx: index("mortgage_parts_mortgage_idx").on(t.mortgageId) }))

export const mortgageExtraPayments = pgTable("mortgage_extra_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  partId: uuid("part_id").notNull().references(() => mortgageParts.id, { onDelete: "cascade" }),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ mortgage_extra_payments_part_idx: index("mortgage_extra_payments_part_idx").on(t.partId) }))

export const mortgageMembers = pgTable("mortgage_members", {
  mortgageId: uuid("mortgage_id").notNull().references(() => mortgages.id, { onDelete: "cascade" }),
  groupName: text("group_name").notNull(),
  role: text("role").notNull().default("viewer"), // "viewer" | "editor"
}, (t) => ({ pk: primaryKey({ columns: [t.mortgageId, t.groupName] }), mortgage_members_group_idx: index("mortgage_members_group_idx").on(t.groupName) }))

// ─── Loans ─────────────────────────────────────────────────────────────────
// Personal loans, car loans, student loans, etc. — separate from mortgages.
// Same amortization model: linear, annuity, or interest_only parts + extra payments.
export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerSub: text("owner_sub"),
  currency: text("currency").notNull().default("EUR"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ loans_owner_idx: index("loans_owner_idx").on(t.ownerSub) }))

export const loanParts = pgTable("loan_parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),  // "linear" | "annuity" | "interest_only"
  principal: numeric("principal", { precision: 15, scale: 2 }).notNull(),
  annualInterestRate: numeric("annual_interest_rate", { precision: 8, scale: 6 }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ loan_parts_loan_idx: index("loan_parts_loan_idx").on(t.loanId) }))

export const loanExtraPayments = pgTable("loan_extra_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  partId: uuid("part_id").notNull().references(() => loanParts.id, { onDelete: "cascade" }),
  paymentDate: date("payment_date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ loan_extra_payments_part_idx: index("loan_extra_payments_part_idx").on(t.partId) }))

export const loanMembers = pgTable("loan_members", {
  loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
  groupName: text("group_name").notNull(),
  role: text("role").notNull().default("viewer"), // "viewer" | "editor"
}, (t) => ({ pk: primaryKey({ columns: [t.loanId, t.groupName] }), loan_members_group_idx: index("loan_members_group_idx").on(t.groupName) }))

// Relations for Drizzle query builder
export const accountRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
  subscriptions: many(subscriptions),
  members: many(accountMembers),
}))

export const accountMemberRelations = relations(accountMembers, ({ one }) => ({
  account: one(accounts, {
    fields: [accountMembers.accountId],
    references: [accounts.id],
  }),
}))

export const subscriptionRelations = relations(subscriptions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [subscriptions.accountId],
    references: [accounts.id],
  }),
  transactions: many(transactions),
}))

export const categoryRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_parent",
  }),
  children: many(categories, {
    relationName: "category_parent",
  }),
  transactions: many(transactions),
}))

export const portfolioRelations = relations(portfolios, ({ many }) => ({
  members: many(portfolioMembers),
  cryptoTrades: many(cryptoTrades),
  cryptoAssets: many(cryptoAssets),
  metalLots: many(metalLots),
  stockTrades: many(stockTrades),
  stockAssets: many(stockAssets),
  stockDividends: many(stockDividends),
}))

export const portfolioMemberRelations = relations(portfolioMembers, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [portfolioMembers.portfolioId],
    references: [portfolios.id],
  }),
}))

export const cryptoTradeRelations = relations(cryptoTrades, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [cryptoTrades.portfolioId],
    references: [portfolios.id],
  }),
}))

export const cryptoAssetRelations = relations(cryptoAssets, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [cryptoAssets.portfolioId],
    references: [portfolios.id],
  }),
}))

export const metalLotRelations = relations(metalLots, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [metalLots.portfolioId],
    references: [portfolios.id],
  }),
  sales: many(metalSales),
}))

export const metalSaleRelations = relations(metalSales, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [metalSales.portfolioId],
    references: [portfolios.id],
  }),
  lot: one(metalLots, {
    fields: [metalSales.lotId],
    references: [metalLots.id],
  }),
}))

export const stockTradeRelations = relations(stockTrades, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [stockTrades.portfolioId],
    references: [portfolios.id],
  }),
}))

export const stockAssetRelations = relations(stockAssets, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [stockAssets.portfolioId],
    references: [portfolios.id],
  }),
}))

export const stockDividendRelations = relations(stockDividends, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [stockDividends.portfolioId],
    references: [portfolios.id],
  }),
}))

export const mortgageRelations = relations(mortgages, ({ many }) => ({
  parts: many(mortgageParts),
  members: many(mortgageMembers),
}))

export const mortgageMemberRelations = relations(mortgageMembers, ({ one }) => ({
  mortgage: one(mortgages, {
    fields: [mortgageMembers.mortgageId],
    references: [mortgages.id],
  }),
}))

export const mortgagePartRelations = relations(mortgageParts, ({ one, many }) => ({
  mortgage: one(mortgages, {
    fields: [mortgageParts.mortgageId],
    references: [mortgages.id],
  }),
  extraPayments: many(mortgageExtraPayments),
}))

export const mortgageExtraPaymentRelations = relations(mortgageExtraPayments, ({ one }) => ({
  part: one(mortgageParts, {
    fields: [mortgageExtraPayments.partId],
    references: [mortgageParts.id],
  }),
}))

export const loanRelations = relations(loans, ({ many }) => ({
  parts: many(loanParts),
  members: many(loanMembers),
}))

export const loanMemberRelations = relations(loanMembers, ({ one }) => ({
  loan: one(loans, {
    fields: [loanMembers.loanId],
    references: [loans.id],
  }),
}))

export const loanPartRelations = relations(loanParts, ({ one, many }) => ({
  loan: one(loans, {
    fields: [loanParts.loanId],
    references: [loans.id],
  }),
  extraPayments: many(loanExtraPayments),
}))

export const loanExtraPaymentRelations = relations(loanExtraPayments, ({ one }) => ({
  part: one(loanParts, {
    fields: [loanExtraPayments.partId],
    references: [loanParts.id],
  }),
}))

export const transactionRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  transferPeer: one(transactions, {
    fields: [transactions.transferPeerId],
    references: [transactions.id],
    relationName: "transfer_peer",
  }),
  subscription: one(subscriptions, {
    fields: [transactions.subscriptionId],
    references: [subscriptions.id],
  }),
}))
