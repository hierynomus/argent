import { Hono } from "hono"
import { eq, and, inArray } from "drizzle-orm"
import { db } from "../db"
import { loans, loanParts, loanExtraPayments, loanMembers } from "../db/schema"
import { computePartState } from "../services/amortization"
import { getViewableLoanIds, getEditableLoanIds, toAccessContext, canEditLoan } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createDebtSchema, updateDebtSchema, createDebtPartSchema, updateDebtPartSchema, createDebtExtraPaymentSchema, addMemberSchema } from "@argent/shared"

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

  const result = await Promise.all(
    rows.map(async (l) => {
      const parts = await db
        .select()
        .from(loanParts)
        .where(eq(loanParts.loanId, l.id))
        .orderBy(loanParts.createdAt)

      const paymentsByPart = await Promise.all(
        parts.map((p) =>
          db.select().from(loanExtraPayments)
            .where(eq(loanExtraPayments.partId, p.id))
            .orderBy(loanExtraPayments.paymentDate)
        )
      )

      const members = await db
        .select({ groupName: loanMembers.groupName, role: loanMembers.role })
        .from(loanMembers)
        .where(eq(loanMembers.loanId, l.id))

      const enrichedParts = parts.map((part, i) => enrichPart(part, paymentsByPart[i] ?? []))
      const totalCurrentBalance = enrichedParts.reduce((sum, p) => sum + p.currentBalance, 0)
      const totalMonthlyPayment = enrichedParts.reduce((sum, p) => sum + p.monthlyPayment, 0)
      return {
        ...l,
        parts: enrichedParts,
        totalCurrentBalance,
        totalMonthlyPayment,
        members,
        isOwner: l.ownerSub === user.sub || user.isAdmin,
        canEdit: editableSet.has(l.id),
      }
    })
  )

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

// Delete loan (owner-only)
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const existing = await db.query.loans.findFirst({ where: (l, { eq }) => eq(l.id, id) })
  if (!existing) return c.json({ error: "Not found" }, 404)
  if (existing.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)
  await db.delete(loans).where(eq(loans.id, id))
  return c.body(null, 204)
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

// Add/update member (owner-only)
app.post("/:id/members", validateJson(addMemberSchema), async (c) => {
  const user = c.get("user")
  const loanId = c.req.param("id")
  const loan = await db.query.loans.findFirst({ where: (l, { eq }) => eq(l.id, loanId) })
  if (!loan) return c.json({ error: "Not found" }, 404)
  if (loan.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")
  const role = body.role ?? "viewer"

  await db
    .insert(loanMembers)
    .values({ loanId, groupName: body.groupName.trim(), role })
    .onConflictDoUpdate({
      target: [loanMembers.loanId, loanMembers.groupName],
      set: { role },
    })

  return c.json({ groupName: body.groupName.trim(), role }, 201)
})

// Remove member (owner-only)
app.delete("/:id/members/:groupName", async (c) => {
  const user = c.get("user")
  const { id: loanId, groupName } = c.req.param()
  const loan = await db.query.loans.findFirst({ where: (l, { eq }) => eq(l.id, loanId) })
  if (!loan) return c.json({ error: "Not found" }, 404)
  if (loan.ownerSub !== user.sub && !user.isAdmin) return c.json({ error: "Forbidden" }, 403)

  await db.delete(loanMembers)
    .where(and(eq(loanMembers.loanId, loanId), eq(loanMembers.groupName, groupName)))
  return c.body(null, 204)
})

export default app
