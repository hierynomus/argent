import { Decimal, cents } from "../services/money"
import { Hono } from "hono"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { portfolios, portfolioMembers, metalLots, metalSales } from "../db/schema"
import { getViewablePortfolioIds, getEditablePortfolioIds, toAccessContext, canEditPortfolio, canViewPortfolio } from "../services/accessControl"
import { getMetalPricePerGram } from "../services/priceService"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { portfolioResource } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { validateJson } from "../middleware/validate"
import { createPortfolioSchema, updatePortfolioSchema, createMetalLotSchema, createMetalSaleSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const OZ_TO_G = 31.1035

function toGrams(amount: number, unit: string): number {
  return unit === "oz" ? amount * OZ_TO_G : amount
}

// List portfolios
app.get("/", async (c) => {
  const user = c.get("user")
  const [ids, editableIds] = await Promise.all([
    getViewablePortfolioIds(toAccessContext(user), "metals"),
    getEditablePortfolioIds(toAccessContext(user), "metals"),
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
    .values({ type: "metals", name, currency, ownerSub: user.sub })
    .returning()
  return c.json(portfolio, 201)
})

// Get portfolio with per-lot inventory and computed values
app.get("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canViewPortfolio(toAccessContext(user), "metals", id))) return c.json({ error: "Not found" }, 404)

  const portfolio = await db.query.portfolios.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!portfolio) return c.json({ error: "Not found" }, 404)

  const lots = await db.select().from(metalLots)
    .where(eq(metalLots.portfolioId, id))
    .orderBy(metalLots.purchaseDate)

  const sales = await db.select().from(metalSales).where(eq(metalSales.portfolioId, id))

  const currency = portfolio.currency as "EUR" | "USD"

  // Fetch unique metal prices once
  const uniqueMetals = [...new Set(lots.map((l) => l.metal))]
  const prices = Object.fromEntries(
    await Promise.all(uniqueMetals.map(async (m) => [m, await getMetalPricePerGram(m, currency)] as const))
  )

  let totalInvestedOpen = 0
  let totalCurrentValueOpen = 0
  let allHavePrices = lots.some((l) => {
    const soldForLot = sales.filter((s) => s.lotId === l.id).reduce((s, x) => s + x.quantitySold, 0)
    return l.quantity - soldForLot > 0
  })
  let totalRealizedPnL = 0

  const enrichedLots = lots.map((lot) => {
    const soldForLot = sales.filter((s) => s.lotId === lot.id)
    const quantitySoldTotal = soldForLot.reduce((s, x) => s + x.quantitySold, 0)
    const remainingQuantity = lot.quantity - quantitySoldTotal
    const pricePerPiece = parseFloat(lot.pricePerPiece)

    const realizedPnL = soldForLot.reduce((s, sale) => {
      return s + (parseFloat(sale.totalReceived) - sale.quantitySold * pricePerPiece)
    }, 0)
    totalRealizedPnL += realizedPnL

    const weightGramsPerPiece = toGrams(parseFloat(lot.weightPerPiece), lot.unit)
    const currentPricePerGram = prices[lot.metal] ?? null

    let currentValuePerPiece: number | null = null
    let unrealizedPnL: number | null = null

    if (currentPricePerGram !== null) {
      currentValuePerPiece = weightGramsPerPiece * currentPricePerGram
      if (remainingQuantity > 0) {
        totalCurrentValueOpen += remainingQuantity * currentValuePerPiece
        unrealizedPnL = remainingQuantity * (currentValuePerPiece - pricePerPiece)
      }
    } else if (remainingQuantity > 0) {
      allHavePrices = false
    }

    if (remainingQuantity > 0) {
      totalInvestedOpen += remainingQuantity * pricePerPiece
    }

    return {
      ...lot,
      remainingQuantity,
      currentPricePerGram,
      currentValuePerPiece,
      unrealizedPnL,
      realizedPnL,
      sales: soldForLot,
    }
  })

  const [members, editableIds] = await Promise.all([
    db.select({ groupName: portfolioMembers.groupName, role: portfolioMembers.role })
      .from(portfolioMembers)
      .where(eq(portfolioMembers.portfolioId, id)),
    getEditablePortfolioIds(toAccessContext(user), "metals"),
  ])

  return c.json({
    ...portfolio,
    lots: enrichedLots,
    totalInvestedOpen: cents(totalInvestedOpen),
    totalCurrentValueOpen: allHavePrices ? cents(totalCurrentValueOpen) : null,
    totalUnrealizedPnL: allHavePrices ? cents(new Decimal(totalCurrentValueOpen).minus(totalInvestedOpen)) : null,
    totalRealizedPnL: cents(totalRealizedPnL),
    members,
    isOwner: isOwnerOrAdmin(portfolio, user),
    canEdit: editableIds.includes(id),
  })
})

// Rename / update portfolio
app.patch("/:id", validateJson(updatePortfolioSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "metals", id))) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const updates: Partial<typeof portfolios.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.currency !== undefined) updates.currency = body.currency
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

  const [updated] = await db.update(portfolios).set(updates).where(eq(portfolios.id, id)).returning()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// Add a lot — immutable purchase record
app.post("/:id/lots", validateJson(createMetalLotSchema), async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  if (!(await canEditPortfolio(toAccessContext(user), "metals", portfolioId))) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")

  const unit = body.unit === "oz" ? "oz" : "g"
  const quantity = Math.max(1, Math.round(body.quantity ?? 1))

  const [lot] = await db
    .insert(metalLots)
    .values({
      portfolioId,
      purchaseDate: body.purchaseDate,
      metal: body.metal.toLowerCase().trim(),
      itemName: body.itemName?.trim() ?? null,
      itemForm: body.itemForm ?? null,
      weightPerPiece: body.weightPerPiece,
      unit,
      quantity,
      pricePerPiece: body.pricePerPiece,
      notes: body.notes ?? null,
    })
    .returning()

  return c.json(lot, 201)
})

// Record a sale against a specific lot
app.post("/:id/lots/:lotId/sales", validateJson(createMetalSaleSchema), async (c) => {
  const user = c.get("user")
  const portfolioId = c.req.param("id")
  const lotId = c.req.param("lotId")
  if (!(await canEditPortfolio(toAccessContext(user), "metals", portfolioId))) return c.json({ error: "Forbidden" }, 403)

  const lot = await db.query.metalLots.findFirst({ where: (l, { eq }) => eq(l.id, lotId) })
  if (!lot || lot.portfolioId !== portfolioId) return c.json({ error: "Lot not found" }, 404)

  const body = c.req.valid("json")

  // Validate remaining quantity
  const existingSales = await db.select().from(metalSales).where(eq(metalSales.lotId, lotId))
  const alreadySold = existingSales.reduce((s, sale) => s + sale.quantitySold, 0)
  const remaining = lot.quantity - alreadySold

  if (body.quantitySold > remaining) {
    return c.json({ error: `Cannot sell ${body.quantitySold}: only ${remaining} remaining` }, 400)
  }

  const [sale] = await db
    .insert(metalSales)
    .values({
      portfolioId,
      lotId,
      saleDate: body.saleDate,
      quantitySold: body.quantitySold,
      totalReceived: body.totalReceived,
      notes: body.notes ?? null,
    })
    .returning()

  return c.json(sale, 201)
})

// Lots and sales are immutable
app.delete("/:id/lots/:lotId", (c) =>
  c.json({ error: "Lots are immutable and cannot be deleted. Delete the entire portfolio to start over." }, 405)
)
app.delete("/:id/lots/:lotId/sales/:saleId", (c) =>
  c.json({ error: "Sales are immutable and cannot be deleted. Delete the entire portfolio to start over." }, 405)
)

// delete the resource and manage who it is shared with (owner/admin only)
mountOwnerRoutes(app, { resource: portfolioResource("metals"), canView: (ctx, id) => canViewPortfolio(ctx, "metals", id) })

export default app
