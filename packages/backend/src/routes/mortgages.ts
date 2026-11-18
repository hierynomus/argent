import { Hono } from "hono"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "../db"
import { mortgages, mortgageParts, mortgageExtraPayments, mortgageMembers } from "../db/schema"
import { computePartState } from "../services/amortization"
import { getViewableMortgageIds, getEditableMortgageIds, toAccessContext, canEditMortgage } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createDebtSchema, updateDebtSchema, createDebtPartSchema, updateDebtPartSchema, createDebtExtraPaymentSchema, addMemberSchema } from "@argent/shared"

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
    currentBalance: state.currentBalance,
    monthlyPayment: state.monthlyPayment,
    monthlyInterest: state.monthlyInterest,
    monthlyPrincipal: state.monthlyPrincipal,
    originalMonthlyPayment: state.originalMonthlyPayment,
    totalMonths: state.totalMonths,
    monthsElapsed: state.monthsElapsed,
    monthsRemaining: state.monthsRemaining,
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

  const result = await Promise.all(
    rows.map(async (m) => {
      const parts = await db
        .select()
        .from(mortgageParts)
        .where(eq(mortgageParts.mortgageId, m.id))
        .orderBy(mortgageParts.createdAt)

      const paymentsByPart = await Promise.all(
        parts.map((p) =>
          db.select().from(mortgageExtraPayments)
            .where(eq(mortgageExtraPayments.partId, p.id))
            .orderBy(mortgageExtraPayments.paymentDate)
        )
      )

      const members = await db
        .select({ groupName: mortgageMembers.groupName, role: mortgageMembers.role })
        .from(mortgageMembers)
        .where(eq(mortgageMembers.mortgageId, m.id))

      const enrichedParts = parts.map((part, i) => enrichPart(part, paymentsByPart[i] ?? []))
      const totalCurrentBalance = enrichedParts.reduce((sum, p) => sum + p.currentBalance, 0)
      const totalMonthlyPayment = enrichedParts.reduce((sum, p) => sum + p.monthlyPayment, 0)
      return {
        ...m,
        parts: enrichedParts,
        totalCurrentBalance,
        totalMonthlyPayment,
        members,
        isOwner: m.ownerSub === user.sub || user.isAdmin,
        canEdit: editableSet.has(m.id),
      }
    })
  )

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

// Delete mortgage (owner-only)
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const existing = await db.query.mortgages.findFirst({ where: (m, { eq }) => eq(m.id, id) })
  if (!existing) return c.json({ error: "Not found" }, 404)
  if (existing.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)
  await db.delete(mortgages).where(eq(mortgages.id, id))
  return c.body(null, 204)
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
      startDate: body.startDate,
      endDate: body.endDate,
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

// Add/update member (owner-only)
app.post("/:id/members", validateJson(addMemberSchema), async (c) => {
  const user = c.get("user")
  const mortgageId = c.req.param("id")
  const mortgage = await db.query.mortgages.findFirst({ where: (m, { eq }) => eq(m.id, mortgageId) })
  if (!mortgage) return c.json({ error: "Not found" }, 404)
  if (mortgage.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const role = body.role ?? "viewer"

  await db
    .insert(mortgageMembers)
    .values({ mortgageId, groupName: body.groupName.trim(), role })
    .onConflictDoUpdate({
      target: [mortgageMembers.mortgageId, mortgageMembers.groupName],
      set: { role },
    })

  return c.json({ groupName: body.groupName.trim(), role }, 201)
})

// Remove member (owner-only)
app.delete("/:id/members/:groupName", async (c) => {
  const user = c.get("user")
  const { id: mortgageId, groupName } = c.req.param()
  const mortgage = await db.query.mortgages.findFirst({ where: (m, { eq }) => eq(m.id, mortgageId) })
  if (!mortgage) return c.json({ error: "Not found" }, 404)
  if (mortgage.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  await db.delete(mortgageMembers)
    .where(and(eq(mortgageMembers.mortgageId, mortgageId), eq(mortgageMembers.groupName, groupName)))
  return c.body(null, 204)
})

export default app
