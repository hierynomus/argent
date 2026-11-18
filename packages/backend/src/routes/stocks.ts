import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { portfolios, portfolioMembers, stockTrades, stockAssets, stockDividends } from "../db/schema"
import { getViewablePortfolioIds, getEditablePortfolioIds, toAccessContext, canEditPortfolio, canViewPortfolio } from "../services/accessControl"
import { getStockPrice, getStockName } from "../services/priceService"
import { computeFifo, investmentSymbols } from "../services/fifo"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createPortfolioSchema, updatePortfolioSchema, addMemberSchema, createStockTradeSchema, createStockDividendSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

// List portfolios
app.get("/", async (c) => {
  const user = c.get("user")
  const [ids, editableIds] = await Promise.all([
    getViewablePortfolioIds(toAccessContext(user), "stocks"),
    getEditablePortfolioIds(toAccessContext(user), "stocks"),
  ])
  if (ids.length === 0) return c.json([])
  const editableSet = new Set(editableIds)
  const rows = await db.select().from(portfolios).where(inArray(portfolios.id, ids)).orderBy(portfolios.name)
  const result = await Promise.all(
    rows.map(async (p) => {
      const members = await db
        .select({ groupName: portfolioMembers.groupName, role: portfolioMembers.role })
        .from(portfolioMembers)
        .where(eq(portfolioMembers.portfolioId, p.id))
      return {
        ...p,
        members,
        isOwner: p.ownerSub === user.sub || user.isAdmin,
        canEdit: editableSet.has(p.id),
      }
    })
  )
  return c.json(result)
})

// Create portfolio
app.post("/", validateJson(createPortfolioSchema), async (c) => {
  const user = c.get("user")
  const { name, currency = "EUR", broker: brokerInput } = c.req.valid("json")
  const broker = brokerInput || null
  const [portfolio] = await db
    .insert(portfolios)
    .values({ type: "stocks", name, currency, broker, ownerSub: user.sub })
    .returning()
  return c.json(portfolio, 201)
})

// Ticker lookup — used to auto-fill the asset name on the buy form. No portfolio
// access check needed since it doesn't touch any portfolio's data.
app.get("/lookup/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase().trim()
  const name = await getStockName(symbol)
  return c.json({ symbol, name })
})

// Get portfolio with computed positions, trade history, and dividends
app.get("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canViewPortfolio(toAccessContext(user), "stocks", id))) return c.json({ error: "Not found" }, 404)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const [trades, assets, dividends] = await Promise.all([
    db.select().from(stockTrades).where(eq(stockTrades.portfolioId, id)).orderBy(stockTrades.tradeDate),
    db.select().from(stockAssets).where(eq(stockAssets.portfolioId, id)),
    db.select().from(stockDividends).where(eq(stockDividends.portfolioId, id)).orderBy(stockDividends.paymentDate),
  ])

  const symbols = investmentSymbols(trades, portfolio.currency)
  const currency = portfolio.currency as "EUR" | "USD"
  const prices = Object.fromEntries(
    await Promise.all(symbols.map(async (s) => [s, await getStockPrice(s, currency)] as const)),
  )

  const positions = symbols.map((symbol) => {
    const fifo = computeFifo(trades, symbol, portfolio.currency)
    const asset = assets.find((a) => a.symbol === symbol)
    const currentPrice = prices[symbol] ?? null
    const currentValueEur = currentPrice !== null ? fifo.balance * currentPrice : null
    const unrealizedPnL = currentValueEur !== null ? currentValueEur - fifo.totalCostEur : null
    const totalDividends = dividends
      .filter((d) => d.symbol === symbol)
      .reduce((s, d) => s + parseFloat(d.amount), 0)
    return {
      symbol,
      name: asset?.name ?? symbol,
      assetForm: asset?.assetForm ?? null,
      balance: fifo.balance,
      avgCostBasis: fifo.avgCostBasis,
      totalCostEur: fifo.totalCostEur,
      realizedPnL: fifo.realizedPnL,
      currentPrice,
      currentValueEur,
      unrealizedPnL,
      totalDividends,
    }
  }).sort((a, b) => {
    if (a.balance > 1e-10 && b.balance <= 1e-10) return -1
    if (b.balance > 1e-10 && a.balance <= 1e-10) return 1
    return a.symbol.localeCompare(b.symbol)
  })

  const totalOpenCostEur = positions.reduce((s, p) => s + p.totalCostEur, 0)
  const allHavePrices = positions.some((p) => p.balance > 1e-10) &&
    positions.filter((p) => p.balance > 1e-10).every((p) => p.currentValueEur !== null)
  const totalCurrentValueEur = allHavePrices
    ? positions.reduce((s, p) => s + (p.currentValueEur ?? 0), 0)
    : null
  const totalRealizedPnL = positions.reduce((s, p) => s + p.realizedPnL, 0)
  const totalUnrealizedPnL = totalCurrentValueEur !== null ? totalCurrentValueEur - totalOpenCostEur : null
  const totalDividends = dividends.reduce((s, d) => s + parseFloat(d.amount), 0)

  const [members, editableIds] = await Promise.all([
    db.select({ groupName: portfolioMembers.groupName, role: portfolioMembers.role })
      .from(portfolioMembers)
      .where(eq(portfolioMembers.portfolioId, id)),
    getEditablePortfolioIds(toAccessContext(user), "stocks"),
  ])

  return c.json({
    ...portfolio,
    trades,
    dividends,
    positions,
    totalOpenCostEur,
    totalCurrentValueEur,
    totalRealizedPnL,
    totalUnrealizedPnL,
    totalDividends,
    members,
    isOwner: portfolio.ownerSub === user.sub || user.isAdmin,
    canEdit: editableIds.includes(id),
  })
})

// Rename / update portfolio
app.patch("/:id", validateJson(updatePortfolioSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "stocks", id))) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const updates: Partial<typeof portfolios.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.currency !== undefined) updates.currency = body.currency
  if (body.broker !== undefined) updates.broker = body.broker || null
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

  const [updated] = await db.update(portfolios).set(updates).where(eq(portfolios.id, id)).returning()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// Delete portfolio + all trades/dividends (cascade) — owner-only
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)
  if (!(await canViewPortfolio(toAccessContext(user), "stocks", id))) return c.json({ error: "Not found" }, 404)
  if (portfolio.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  await db.delete(portfolios).where(eq(portfolios.id, id))
  return c.body(null, 204)
})

// Add/update member (owner-only)
app.post("/:id/members", validateJson(addMemberSchema), async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, portfolioId) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)
  if (portfolio.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const role = body.role ?? "viewer"

  await db
    .insert(portfolioMembers)
    .values({ portfolioId, groupName: body.groupName.trim(), role })
    .onConflictDoUpdate({
      target: [portfolioMembers.portfolioId, portfolioMembers.groupName],
      set: { role },
    })

  return c.json({ groupName: body.groupName.trim(), role }, 201)
})

// Remove member (owner-only)
app.delete("/:id/members/:groupName", async (c) => {
  const user = c.get("user")
  const { id: portfolioId, groupName } = c.req.param()
  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, portfolioId) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)
  if (portfolio.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  await db.delete(portfolioMembers)
    .where(and(eq(portfolioMembers.portfolioId, portfolioId), eq(portfolioMembers.groupName, groupName)))
  return c.body(null, 204)
})

// Add a trade — immutable ledger entry (buy or sell only, no swaps)
app.post("/:id/trades", validateJson(createStockTradeSchema), async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "stocks", portfolioId))) return c.json({ error: "Forbidden" }, 403)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, portfolioId) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")

  const baseCur = portfolio.currency
  const symbol = body.symbol // validated + upper-cased by the schema
  const isBuy = body.type === "buy"

  if (!isBuy) {
    const existingTrades = await db.select().from(stockTrades).where(eq(stockTrades.portfolioId, portfolioId))
    const fifo = computeFifo(existingTrades, symbol, baseCur)
    if (parseFloat(body.quantity) > fifo.balance + 1e-8) {
      return c.json({ error: `Insufficient balance: have ${fifo.balance} ${symbol}` }, 400)
    }
  }

  const [trade] = await db
    .insert(stockTrades)
    .values({
      portfolioId,
      tradeDate: body.tradeDate,
      fromSymbol: isBuy ? baseCur : symbol,
      fromAmount: isBuy ? body.amount : body.quantity,
      toSymbol: isBuy ? symbol : baseCur,
      toAmount: isBuy ? body.quantity : body.amount,
      baseCurrencyAmount: body.amount,
      notes: body.notes ?? null,
    })
    .returning()

  if (isBuy && body.assetName) {
    await db
      .insert(stockAssets)
      .values({ portfolioId, symbol, name: body.assetName.trim(), assetForm: null })
      .onConflictDoUpdate({
        target: [stockAssets.portfolioId, stockAssets.symbol],
        set: { name: body.assetName.trim() },
      })
  }

  return c.json(trade, 201)
})

// Trades are immutable — deletion is forbidden
app.delete("/:id/trades/:tradeId", (c) =>
  c.json({ error: "Trades are immutable ledger entries and cannot be deleted. Delete the entire portfolio to start over." }, 405)
)

// Record a dividend payment
app.post("/:id/dividends", validateJson(createStockDividendSchema), async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "stocks", portfolioId))) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")

  const [dividend] = await db
    .insert(stockDividends)
    .values({
      portfolioId,
      symbol: body.symbol,
      paymentDate: body.paymentDate,
      amount: body.amount,
      notes: body.notes ?? null,
    })
    .returning()

  return c.json(dividend, 201)
})

// Delete a dividend record — not part of the FIFO cost-basis chain, safe to remove
app.delete("/:id/dividends/:dividendId", async (c) => {
  const user = c.get("user")
  const { id: portfolioId, dividendId } = c.req.param()
  if (!(await canEditPortfolio(toAccessContext(user), "stocks", portfolioId))) return c.json({ error: "Forbidden" }, 403)

  await db.delete(stockDividends)
    .where(and(eq(stockDividends.id, dividendId), eq(stockDividends.portfolioId, portfolioId)))
  return c.body(null, 204)
})

export default app
