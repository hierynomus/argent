import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { portfolios, portfolioMembers, cryptoTrades, cryptoAssets } from "../db/schema"
import { getViewablePortfolioIds, getEditablePortfolioIds } from "../services/accessControl"
import { getCryptoPrice } from "../services/priceService"
import { computeFifo, investmentSymbols } from "../services/fifo"
import type { AuthUser } from "../middleware/auth"

const app = new Hono<{ Variables: { user: AuthUser } }>()

function ctx(user: AuthUser) {
  return { groups: user.groups ?? [], sub: user.sub, isAdmin: user.isAdmin }
}

// List portfolios
app.get("/", async (c) => {
  const user = c.get("user")
  const [ids, editableIds] = await Promise.all([
    getViewablePortfolioIds(ctx(user), "crypto"),
    getEditablePortfolioIds(ctx(user), "crypto"),
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
app.post("/", async (c) => {
  const user = c.get("user")
  const body = await c.req.json<{ name: string; currency?: string }>()
  const name = body.name?.trim()
  if (!name) return c.json({ error: "name is required" }, 400)

  const currency = body.currency === "USD" ? "USD" : "EUR"
  const [portfolio] = await db
    .insert(portfolios)
    .values({ type: "crypto", name, currency, ownerSub: user.sub })
    .returning()
  return c.json(portfolio, 201)
})

// Get portfolio with computed positions and trade history
app.get("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const ids = await getViewablePortfolioIds(ctx(user), "crypto")
  if (!ids.includes(id)) return c.json({ error: "Not found" }, 404)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const [trades, assets] = await Promise.all([
    db.select().from(cryptoTrades).where(eq(cryptoTrades.portfolioId, id)).orderBy(cryptoTrades.tradeDate),
    db.select().from(cryptoAssets).where(eq(cryptoAssets.portfolioId, id)),
  ])

  const symbols = investmentSymbols(trades, portfolio.currency)
  const currency = portfolio.currency as "EUR" | "USD"
  const prices = Object.fromEntries(
    await Promise.all(symbols.map(async (s) => [s, await getCryptoPrice(s, currency)] as const)),
  )

  const positions = symbols.map((symbol) => {
    const fifo = computeFifo(trades, symbol, portfolio.currency)
    const asset = assets.find((a) => a.symbol === symbol)
    const currentPrice = prices[symbol] ?? null
    const currentValueEur = currentPrice !== null ? fifo.balance * currentPrice : null
    const unrealizedPnL = currentValueEur !== null ? currentValueEur - fifo.totalCostEur : null
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

  const [members, editableIds] = await Promise.all([
    db.select({ groupName: portfolioMembers.groupName, role: portfolioMembers.role })
      .from(portfolioMembers)
      .where(eq(portfolioMembers.portfolioId, id)),
    getEditablePortfolioIds(ctx(user), "crypto"),
  ])

  return c.json({
    ...portfolio,
    trades,
    positions,
    totalOpenCostEur,
    totalCurrentValueEur,
    totalRealizedPnL,
    totalUnrealizedPnL,
    members,
    isOwner: portfolio.ownerSub === user.sub || user.isAdmin,
    canEdit: editableIds.includes(id),
  })
})

// Rename / update portfolio
app.patch("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const ids = await getEditablePortfolioIds(ctx(user), "crypto")
  if (!ids.includes(id)) return c.json({ error: "Forbidden" }, 403)

  const body = await c.req.json<{ name?: string; currency?: string }>()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.currency !== undefined) updates.currency = body.currency

  const [updated] = await db.update(portfolios).set(updates).where(eq(portfolios.id, id)).returning()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// Delete portfolio + all trades (cascade) — owner-only
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)
  const ids = await getViewablePortfolioIds(ctx(user), "crypto")
  if (!ids.includes(id)) return c.json({ error: "Not found" }, 404)
  if (portfolio.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  await db.delete(portfolios).where(eq(portfolios.id, id))
  return c.body(null, 204)
})

// Add/update member (owner-only)
app.post("/:id/members", async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, portfolioId) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)
  if (portfolio.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  const body = await c.req.json<{ groupName: string; role?: "viewer" | "editor" }>()
  if (!body.groupName?.trim()) return c.json({ error: "groupName is required" }, 400)
  const role = body.role === "editor" ? "editor" : "viewer"

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

// Add a trade — immutable ledger entry (buy, sell, or swap)
app.post("/:id/trades", async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  const ids = await getEditablePortfolioIds(ctx(user), "crypto")
  if (!ids.includes(portfolioId)) return c.json({ error: "Forbidden" }, 403)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, portfolioId) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const body = await c.req.json<{
    tradeDate: string
    fromSymbol: string
    fromAmount: string
    toSymbol: string
    toAmount: string
    baseCurrencyAmount?: string
    assetName?: string
    notes?: string
  }>()

  if (!body.tradeDate || !body.fromSymbol || !body.fromAmount || !body.toSymbol || !body.toAmount) {
    return c.json({ error: "tradeDate, fromSymbol, fromAmount, toSymbol, toAmount are required" }, 400)
  }

  const baseCur = portfolio.currency
  const fromSym = body.fromSymbol.toUpperCase().trim()
  const toSym = body.toSymbol.toUpperCase().trim()
  const isBuy = fromSym === baseCur && toSym !== baseCur
  const isSell = fromSym !== baseCur && toSym === baseCur
  const isSwap = fromSym !== baseCur && toSym !== baseCur

  // Validate sufficient balance for sells and swap-outs
  if (isSell || isSwap) {
    const existingTrades = await db.select().from(cryptoTrades).where(eq(cryptoTrades.portfolioId, portfolioId))
    const fifo = computeFifo(existingTrades, fromSym, baseCur)
    if (parseFloat(body.fromAmount) > fifo.balance + 1e-8) {
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
    const consumed = Math.min(parseFloat(body.fromAmount), fifo.balance)
    baseCurrencyAmount = (consumed * fifo.avgCostBasis).toFixed(2)
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

export default app
