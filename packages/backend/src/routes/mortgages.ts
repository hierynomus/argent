import { Hono } from "hono"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "../db"
import { mortgages, mortgageParts, mortgageExtraPayments, mortgageMembers } from "../db/schema"
import { computePartState } from "../services/amortization"
import { getViewableMortgageIds, getEditableMortgageIds, toAccessContext, canEditMortgage, canViewMortgage } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { mortgageResource } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { validateJson } from "../middleware/validate"
import { createDebtSchema, updateDebtSchema, createDebtPartSchema, updateDebtPartSchema, createDebtExtraPaymentSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

function enrichPart(
  part: typeof mortgageParts.$inferSelect,
  payments: (typeof mortgageExtraPayments.$inferSelect)[],
) {
  const state = computePartState(part, payments)
  return {
    ...part,
    extraPayments: payments.map((p) => ({
      id: p.id,
      partId: p.partId,
      paymentDate: p.paymentDate,
      amount: p.amount,
      notes: p.notes,
      createdAt: p.createdAt,
    })),
    ...state, // balance, payment components, term and projected end date
  }
}

// List all mortgages with parts
app.get("/", async (c) => {
  const user = c.get("user")
  const ctx = toAccessContext(user)
  const [ids, editableIds] = await Promise.all([
    getViewableMortgageIds(ctx),
    getEditableMortgageIds(ctx),
  ])
  if (ids.length === 0) return c.json([])
  const editableSet = new Set(editableIds)

  const rows = await db
    .select()
    .from(mortgages)
    .where(inArray(mortgages.id, ids))
    .orderBy(mortgages.name)

  // three queries for everything (parts, extra payments, members), grouped here instead of per mortgage
  const rowIds = rows.map((r) => r.id)
  const allParts = await db.select().from(mortgageParts).where(inArray(mortgageParts.mortgageId, rowIds)).orderBy(mortgageParts.createdAt)
  const allPayments = allParts.length === 0 ? [] : await db
    .select().from(mortgageExtraPayments)
    .where(inArray(mortgageExtraPayments.partId, allParts.map((p) => p.id)))
    .orderBy(mortgageExtraPayments.paymentDate)
  const allMembers = await db
    .select({ mortgageId: mortgageMembers.mortgageId, groupName: mortgageMembers.groupName, role: mortgageMembers.role })
    .from(mortgageMembers)
    .where(inArray(mortgageMembers.mortgageId, rowIds))
  const partsOf = groupBy(allParts, (p) => p.mortgageId)
  const paymentsOf = groupBy(allPayments, (p) => p.partId)
  const membersOf = groupBy(allMembers, (m) => m.mortgageId)

  const result = rows.map((m) => {
    const enrichedParts = (partsOf.get(m.id) ?? []).map((part) => enrichPart(part, paymentsOf.get(part.id) ?? []))
    return {
      ...m,
      parts: enrichedParts,
      totalCurrentBalance: enrichedParts.reduce((sum, p) => sum + p.currentBalance, 0),
      totalMonthlyPayment: enrichedParts.reduce((sum, p) => sum + p.monthlyPayment, 0),
      members: (membersOf.get(m.id) ?? []).map(({ groupName, role }) => ({ groupName, role })),
      isOwner: isOwnerOrAdmin(m, user),
      canEdit: editableSet.has(m.id),
    }
  })

  return c.json(result)
})

// Create mortgage
app.post("/", validateJson(createDebtSchema), async (c) => {
  const user = c.get("user")
  const { name, currency = "EUR" } = c.req.valid("json")
  const [mortgage] = await db
    .insert(mortgages)
    .values({ name, currency, ownerSub: user.sub })
    .returning()
  return c.json(mortgage, 201)
})

// Update mortgage
app.patch("/:id", validateJson(updateDebtSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const ctx = toAccessContext(user)
  if (!(await canEditMortgage(ctx, id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  const updates: Partial<typeof mortgages.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.currency === "EUR" || body.currency === "USD") updates.currency = body.currency
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
  const [updated] = await db.update(mortgages).set(updates).where(eq(mortgages.id, id)).returning()
  return c.json(updated)
})

// Add part
app.post("/:id/parts", validateJson(createDebtPartSchema), async (c) => {
  const user = c.get("user")
  const mortgageId = c.req.param("id")
  const ctx = toAccessContext(user)
  if (!(await canEditMortgage(ctx, mortgageId))) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")
  const name = body.name

  const [part] = await db
    .insert(mortgageParts)
    .values({
      mortgageId,
      name,
      type: body.type,
      principal: body.principal,
      annualInterestRate: body.annualInterestRate,
      rateType: body.rateType ?? "nominal",
      startDate: body.startDate,
      endDate: body.endDate,
      firstPaymentDate: body.firstPaymentDate ?? null,
    })
    .returning()

  return c.json(enrichPart(part, []), 201)
})

// Update part
app.patch("/:id/parts/:pid", validateJson(updateDebtPartSchema), async (c) => {
  const user = c.get("user")
  const { id: mortgageId, pid } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditMortgage(ctx, mortgageId))) return c.json({ error: "Not found" }, 404)
  const part = await db.query.mortgageParts.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, pid), eq(p.mortgageId, mortgageId)),
  })
  if (!part) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")
  const updates: Partial<typeof mortgageParts.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.annualInterestRate !== undefined) updates.annualInterestRate = body.annualInterestRate
  if (body.rateType !== undefined) updates.rateType = body.rateType
  if (body.endDate) updates.endDate = body.endDate
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

  const [updated] = await db.update(mortgageParts).set(updates).where(eq(mortgageParts.id, pid)).returning()
  const payments = await db.select().from(mortgageExtraPayments)
    .where(eq(mortgageExtraPayments.partId, pid))
    .orderBy(mortgageExtraPayments.paymentDate)
  return c.json(enrichPart(updated, payments))
})

// Delete part
app.delete("/:id/parts/:pid", async (c) => {
  const user = c.get("user")
  const { id: mortgageId, pid } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditMortgage(ctx, mortgageId))) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(mortgageParts)
    .where(and(eq(mortgageParts.id, pid), eq(mortgageParts.mortgageId, mortgageId)))
    .returning()
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// Add extra payment to part
app.post("/:id/parts/:pid/payments", validateJson(createDebtExtraPaymentSchema), async (c) => {
  const user = c.get("user")
  const { id: mortgageId, pid } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditMortgage(ctx, mortgageId))) return c.json({ error: "Not found" }, 404)
  const part = await db.query.mortgageParts.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, pid), eq(p.mortgageId, mortgageId)),
  })
  if (!part) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")

  const [payment] = await db
    .insert(mortgageExtraPayments)
    .values({ partId: pid, paymentDate: body.paymentDate, amount: body.amount, notes: body.notes ?? null })
    .returning()
  return c.json(payment, 201)
})

// Delete extra payment
app.delete("/:id/parts/:pid/payments/:paymentId", async (c) => {
  const user = c.get("user")
  const { id: mortgageId, pid, paymentId } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditMortgage(ctx, mortgageId))) return c.json({ error: "Not found" }, 404)
  const part = await db.query.mortgageParts.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, pid), eq(p.mortgageId, mortgageId)),
  })
  if (!part) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(mortgageExtraPayments)
    .where(and(eq(mortgageExtraPayments.id, paymentId), eq(mortgageExtraPayments.partId, pid)))
    .returning()
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// delete the resource and manage who it is shared with (owner/admin only)
mountOwnerRoutes(app, { resource: mortgageResource, canView: canViewMortgage })

export default app
