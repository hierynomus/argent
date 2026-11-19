import { Hono } from "hono"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { portfolios, portfolioMembers, cryptoTrades, cryptoAssets } from "../db/schema"
import { getViewablePortfolioIds, getEditablePortfolioIds, toAccessContext, canEditPortfolio, canViewPortfolio } from "../services/accessControl"
import { getCryptoPrices, getCryptoHistory, PriceProviderError } from "../services/priceService"
import { computeFifo, investmentSymbols } from "../services/fifo"
import { buildPositions, summarizePositions } from "../services/positions"
import { exceedsBalance, swapCostBasis } from "../services/money"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { portfolioResource } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { validateJson, validateQuery } from "../middleware/validate"
import { createPortfolioSchema, updatePortfolioSchema, createCryptoTradeSchema, historyQuerySchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

// List portfolios
app.get("/", async (c) => {
  const user = c.get("user")
  const [ids, editableIds] = await Promise.all([
    getViewablePortfolioIds(toAccessContext(user), "crypto"),
    getEditablePortfolioIds(toAccessContext(user), "crypto"),
  ])
  if (ids.length === 0) return c.json([])
  const editableSet = new Set(editableIds)
  const rows = await db.select().from(portfolios).where(inArray(portfolios.id, ids)).orderBy(portfolios.name)
  // one query for all members, grouped here (instead of one query per portfolio)
  const memberRows = await db
    .select({ portfolioId: portfolioMembers.portfolioId, groupName: portfolioMembers.groupName, role: portfolioMembers.role })
    .from(portfolioMembers)
    .where(inArray(portfolioMembers.portfolioId, ids))
  const membersOf = groupBy(memberRows, (m) => m.portfolioId)
  const result = rows.map((p) => ({
    ...p,
    members: (membersOf.get(p.id) ?? []).map(({ groupName, role }) => ({ groupName, role })),
    isOwner: isOwnerOrAdmin(p, user),
    canEdit: editableSet.has(p.id),
  }))
  return c.json(result)
})

// Create portfolio
app.post("/", validateJson(createPortfolioSchema), async (c) => {
  const user = c.get("user")
  const { name, currency = "EUR" } = c.req.valid("json")
  const [portfolio] = await db
    .insert(portfolios)
    .values({ type: "crypto", name, currency, ownerSub: user.sub })
    .returning()
  return c.json(portfolio, 201)
})

// Price history of one coin (for the asset chart). Like the ticker lookup it touches no portfolio data,
// so there is no access check. An unknown symbol gives an empty `points` list; an unavailable provider (rate limit) gives 503.
app.get("/history/:symbol", validateQuery(historyQuerySchema), async (c) => {
  const symbol = c.req.param("symbol").toUpperCase().trim()
  const { range, currency } = c.req.valid("query")
  try {
    const points = await getCryptoHistory(symbol, currency, range)
    return c.json({ symbol, currency, range, points: points ?? [] })
  } catch (err) {
    // the price providers are rate limited or down: not the same as "no history for this symbol"
    if (!(err instanceof PriceProviderError)) throw err
    if (err.retryAfterSec) c.header("Retry-After", String(err.retryAfterSec))
    return c.json({ error: "Price history is temporarily unavailable (the price provider is rate limited). Try again in a minute.", retryAfter: err.retryAfterSec ?? null }, 503)
  }
})

// Get portfolio with computed positions and trade history
app.get("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canViewPortfolio(toAccessContext(user), "crypto", id))) return c.json({ error: "Not found" }, 404)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const [trades, assets] = await Promise.all([
    db.select().from(cryptoTrades).where(eq(cryptoTrades.portfolioId, id)).orderBy(cryptoTrades.tradeDate),
    db.select().from(cryptoAssets).where(eq(cryptoAssets.portfolioId, id)),
  ])

  const symbols = investmentSymbols(trades, portfolio.currency)
  const currency = portfolio.currency as "EUR" | "USD"
  const prices = await getCryptoPrices(symbols, currency)

  const positions = buildPositions(trades, symbols, assets, prices, portfolio.currency)
  const { totalOpenCost, totalCurrentValue, totalRealizedPnL, totalUnrealizedPnL } = summarizePositions(positions)

  const [members, editableIds] = await Promise.all([
    db.select({ groupName: portfolioMembers.groupName, role: portfolioMembers.role })
      .from(portfolioMembers)
      .where(eq(portfolioMembers.portfolioId, id)),
    getEditablePortfolioIds(toAccessContext(user), "crypto"),
  ])

  return c.json({
    ...portfolio,
    trades,
    positions,
    totalOpenCost,
    totalCurrentValue,
    totalRealizedPnL,
    totalUnrealizedPnL,
    members,
    isOwner: isOwnerOrAdmin(portfolio, user),
    canEdit: editableIds.includes(id),
  })
})

// Rename / update portfolio
app.patch("/:id", validateJson(updatePortfolioSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "crypto", id))) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const updates: Partial<typeof portfolios.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.currency !== undefined) updates.currency = body.currency
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

  const [updated] = await db.update(portfolios).set(updates).where(eq(portfolios.id, id)).returning()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// Add a trade — immutable ledger entry (buy, sell, or swap)
app.post("/:id/trades", validateJson(createCryptoTradeSchema), async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "crypto", portfolioId))) return c.json({ error: "Forbidden" }, 403)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, portfolioId) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")

  const baseCur = portfolio.currency
  const fromSym = body.fromSymbol // validated + upper-cased by the schema
  const toSym = body.toSymbol
  const isBuy = fromSym === baseCur && toSym !== baseCur
  const isSell = fromSym !== baseCur && toSym === baseCur
  const isSwap = fromSym !== baseCur && toSym !== baseCur

  // Validate sufficient balance for sells and swap-outs
  if (isSell || isSwap) {
    const existingTrades = await db.select().from(cryptoTrades).where(eq(cryptoTrades.portfolioId, portfolioId))
    const fifo = computeFifo(existingTrades, fromSym, baseCur)
    if (exceedsBalance(body.fromAmount, fifo.balance)) {
      return c.json({ error: `Insufficient balance: have ${fifo.balance} ${fromSym}` }, 400)
    }
  }

  // Compute baseCurrencyAmount (always stored to simplify FIFO queries)
  let baseCurrencyAmount: string
  if (isBuy) {
    baseCurrencyAmount = body.fromAmount
  } else if (isSell) {
    baseCurrencyAmount = body.toAmount
  } else if (body.baseCurrencyAmount) {
    baseCurrencyAmount = body.baseCurrencyAmount
  } else {
    // Auto-compute for swaps: use FIFO cost of consumed fromSym (cost-transfer, zero realized P&L)
    const existingTrades = await db.select().from(cryptoTrades).where(eq(cryptoTrades.portfolioId, portfolioId))
    const fifo = computeFifo(existingTrades, fromSym, baseCur)
    baseCurrencyAmount = swapCostBasis(body.fromAmount, fifo).toFixed(2)
  }

  const [trade] = await db
    .insert(cryptoTrades)
    .values({
      portfolioId,
      tradeDate: body.tradeDate,
      fromSymbol: fromSym,
      fromAmount: body.fromAmount,
      toSymbol: toSym,
      toAmount: body.toAmount,
      baseCurrencyAmount,
      notes: body.notes ?? null,
    })
    .returning()

  // Upsert asset metadata for the received (investment) symbol
  const investSym = isBuy ? toSym : isSwap ? toSym : null
  if (investSym && body.assetName) {
    await db
      .insert(cryptoAssets)
      .values({ portfolioId, symbol: investSym, name: body.assetName.trim(), assetForm: null })
      .onConflictDoUpdate({
        target: [cryptoAssets.portfolioId, cryptoAssets.symbol],
        set: { name: body.assetName.trim() },
      })
  }

  return c.json(trade, 201)
})

// Trades are immutable — deletion is forbidden
app.delete("/:id/trades/:tradeId", (c) =>
  c.json({ error: "Trades are immutable ledger entries and cannot be deleted. Delete the entire portfolio to start over." }, 405)
)

// delete the resource and manage who it is shared with (owner/admin only)
mountOwnerRoutes(app, { resource: portfolioResource("crypto"), canView: (ctx, id) => canViewPortfolio(ctx, "crypto", id) })

export default app
