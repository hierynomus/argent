import { Hono } from "hono"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "../db"
import { loans, loanParts, loanExtraPayments, loanMembers } from "../db/schema"
import { computePartState } from "../services/amortization"
import { getViewableLoanIds, getEditableLoanIds, toAccessContext, canEditLoan, canViewLoan } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { loanResource } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { validateJson } from "../middleware/validate"
import { createDebtSchema, updateDebtSchema, createDebtPartSchema, updateDebtPartSchema, createDebtExtraPaymentSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

function enrichPart(
  part: typeof loanParts.$inferSelect,
  payments: (typeof loanExtraPayments.$inferSelect)[],
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

// List all loans with parts
app.get("/", async (c) => {
  const user = c.get("user")
  const ctx = toAccessContext(user)
  const [ids, editableIds] = await Promise.all([
    getViewableLoanIds(ctx),
    getEditableLoanIds(ctx),
  ])
  if (ids.length === 0) return c.json([])
  const editableSet = new Set(editableIds)

  const rows = await db
    .select()
    .from(loans)
    .where(inArray(loans.id, ids))
    .orderBy(loans.name)

  // three queries for everything (parts, extra payments, members), grouped here instead of per loan
  const rowIds = rows.map((r) => r.id)
  const allParts = await db.select().from(loanParts).where(inArray(loanParts.loanId, rowIds)).orderBy(loanParts.createdAt)
  const allPayments = allParts.length === 0 ? [] : await db
    .select().from(loanExtraPayments)
    .where(inArray(loanExtraPayments.partId, allParts.map((p) => p.id)))
    .orderBy(loanExtraPayments.paymentDate)
  const allMembers = await db
    .select({ loanId: loanMembers.loanId, groupName: loanMembers.groupName, role: loanMembers.role })
    .from(loanMembers)
    .where(inArray(loanMembers.loanId, rowIds))
  const partsOf = groupBy(allParts, (p) => p.loanId)
  const paymentsOf = groupBy(allPayments, (p) => p.partId)
  const membersOf = groupBy(allMembers, (m) => m.loanId)

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

// Create loan
app.post("/", validateJson(createDebtSchema), async (c) => {
  const user = c.get("user")
  const { name, currency = "EUR" } = c.req.valid("json")
  const [loan] = await db
    .insert(loans)
    .values({ name, currency, ownerSub: user.sub })
    .returning()
  return c.json(loan, 201)
})

// Update loan
app.patch("/:id", validateJson(updateDebtSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const ctx = toAccessContext(user)
  if (!(await canEditLoan(ctx, id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  const updates: Partial<typeof loans.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.currency === "EUR" || body.currency === "USD") updates.currency = body.currency
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
  const [updated] = await db.update(loans).set(updates).where(eq(loans.id, id)).returning()
  return c.json(updated)
})

// Add part
app.post("/:id/parts", validateJson(createDebtPartSchema), async (c) => {
  const user = c.get("user")
  const loanId = c.req.param("id")
  const ctx = toAccessContext(user)
  if (!(await canEditLoan(ctx, loanId))) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")
  const name = body.name

  const [part] = await db
    .insert(loanParts)
    .values({
      loanId,
      name,
      type: body.type,
      principal: body.principal,
      annualInterestRate: body.annualInterestRate,
      rateType: body.rateType ?? "nominal",
      startDate: body.startDate,
      endDate: body.endDate,
    })
    .returning()

  return c.json(enrichPart(part, []), 201)
})

// Update part
app.patch("/:id/parts/:pid", validateJson(updateDebtPartSchema), async (c) => {
  const user = c.get("user")
  const { id: loanId, pid } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditLoan(ctx, loanId))) return c.json({ error: "Not found" }, 404)
  const part = await db.query.loanParts.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, pid), eq(p.loanId, loanId)),
  })
  if (!part) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")
  const updates: Partial<typeof loanParts.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.annualInterestRate !== undefined) updates.annualInterestRate = body.annualInterestRate
  if (body.rateType !== undefined) updates.rateType = body.rateType
  if (body.endDate) updates.endDate = body.endDate
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

  const [updated] = await db.update(loanParts).set(updates).where(eq(loanParts.id, pid)).returning()
  const payments = await db.select().from(loanExtraPayments)
    .where(eq(loanExtraPayments.partId, pid))
    .orderBy(loanExtraPayments.paymentDate)
  return c.json(enrichPart(updated, payments))
})

// Delete part
app.delete("/:id/parts/:pid", async (c) => {
  const user = c.get("user")
  const { id: loanId, pid } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditLoan(ctx, loanId))) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(loanParts)
    .where(and(eq(loanParts.id, pid), eq(loanParts.loanId, loanId)))
    .returning()
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// Add extra payment to part
app.post("/:id/parts/:pid/payments", validateJson(createDebtExtraPaymentSchema), async (c) => {
  const user = c.get("user")
  const { id: loanId, pid } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditLoan(ctx, loanId))) return c.json({ error: "Not found" }, 404)
  const part = await db.query.loanParts.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, pid), eq(p.loanId, loanId)),
  })
  if (!part) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")

  const [payment] = await db
    .insert(loanExtraPayments)
    .values({ partId: pid, paymentDate: body.paymentDate, amount: body.amount, notes: body.notes ?? null })
    .returning()
  return c.json(payment, 201)
})

// Delete extra payment
app.delete("/:id/parts/:pid/payments/:paymentId", async (c) => {
  const user = c.get("user")
  const { id: loanId, pid, paymentId } = c.req.param()
  const ctx = toAccessContext(user)
  if (!(await canEditLoan(ctx, loanId))) return c.json({ error: "Not found" }, 404)
  const part = await db.query.loanParts.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, pid), eq(p.loanId, loanId)),
  })
  if (!part) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(loanExtraPayments)
    .where(and(eq(loanExtraPayments.id, paymentId), eq(loanExtraPayments.partId, pid)))
    .returning()
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// delete the resource and manage who it is shared with (owner/admin only)
mountOwnerRoutes(app, { resource: loanResource, canView: canViewLoan })

export default app
