import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { db } from "../db"
import { mortgages, mortgageParts, mortgageExtraPayments, mortgageMembers } from "../db/schema"
import { computePartState } from "../services/amortization"
import { toAccessContext, type AccessContext } from "../services/accessControl"
import { Decimal, cents } from "../services/money"
import type { SharedResource } from "../services/sharedResources"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { groupBy } from "../lib/groupBy"
import { validateJson } from "../middleware/validate"
import { createDebtSchema, updateDebtSchema, createDebtPartSchema, updateDebtPartSchema, createDebtExtraPaymentSchema, previewDebtPartSchema } from "@argent/shared"

/**
 * Everything that differs between mortgages and loans: their tables (which have the same columns apart from
 * the name of the foreign key), the access checks and the shared-resource definition. The routes are one
 * implementation, `debtRoutes`.
 */
export interface DebtKindConfig {
  /** the tables, typed as the mortgage ones: the loan tables have exactly the same columns */
  tables: { debts: typeof mortgages; parts: typeof mortgageParts; payments: typeof mortgageExtraPayments; members: typeof mortgageMembers }
  /** the foreign key columns pointing at the debt, and their property name in an insert */
  partDebtColumn: PgColumn
  memberDebtColumn: PgColumn
  foreignKey: "mortgageId" | "loanId"
  resource: SharedResource
  getViewableIds: (ctx: AccessContext) => Promise<string[]>
  getEditableIds: (ctx: AccessContext) => Promise<string[]>
  canView: (ctx: AccessContext, id: string) => Promise<boolean>
  canEdit: (ctx: AccessContext, id: string) => Promise<boolean>
}

function enrichPart(part: typeof mortgageParts.$inferSelect, payments: (typeof mortgageExtraPayments.$inferSelect)[]) {
  return {
    ...part,
    extraPayments: payments.map((p) => ({ id: p.id, partId: p.partId, paymentDate: p.paymentDate, amount: p.amount, notes: p.notes, createdAt: p.createdAt })),
    ...computePartState(part, payments), // balance, payment components, term and projected end date
  }
}

const sumOf = (values: number[]) => cents(values.reduce((s, v) => s.plus(v), new Decimal(0)))

/** The router of a debt kind: list with computed amortization, create/update/delete, parts, extra payments, sharing. */
export function debtRoutes(cfg: DebtKindConfig) {
  const { debts, parts, payments: extraPayments, members } = cfg.tables
  // the property name of the foreign key; typed as the mortgage one, at runtime it is `loanId` for loans
  const fk = cfg.foreignKey as "mortgageId"
  const app = new Hono<{ Variables: { user: AuthUser } }>()

  const findPart = async (debtId: string, partId: string) =>
    (await db.select().from(parts).where(and(eq(parts.id, partId), eq(cfg.partDebtColumn, debtId))).limit(1))[0]

  // List all with parts
  app.get("/", async (c) => {
    const user = c.get("user")
    const ctx = toAccessContext(user)
    const [ids, editableIds] = await Promise.all([cfg.getViewableIds(ctx), cfg.getEditableIds(ctx)])
    if (ids.length === 0) return c.json([])
    const editableSet = new Set(editableIds)

    const rows = await db.select().from(debts).where(inArray(debts.id, ids)).orderBy(debts.name)

    // three queries for everything (parts, extra payments, members), grouped here instead of per debt
    const rowIds = rows.map((r) => r.id)
    const allParts = await db.select().from(parts).where(inArray(cfg.partDebtColumn, rowIds)).orderBy(parts.createdAt)
    const allPayments = allParts.length === 0 ? [] : await db
      .select().from(extraPayments)
      .where(inArray(extraPayments.partId, allParts.map((p) => p.id)))
      .orderBy(extraPayments.paymentDate)
    const allMembers = await db
      .select({ debtId: members[fk], groupName: members.groupName, role: members.role })
      .from(members)
      .where(inArray(cfg.memberDebtColumn, rowIds))
    const partsOf = groupBy(allParts, (p) => p[fk])
    const paymentsOf = groupBy(allPayments, (p) => p.partId)
    const membersOf = groupBy(allMembers, (m) => m.debtId)

    return c.json(rows.map((d) => {
      const enrichedParts = (partsOf.get(d.id) ?? []).map((part) => enrichPart(part, paymentsOf.get(part.id) ?? []))
      return {
        ...d,
        parts: enrichedParts,
        totalCurrentBalance: sumOf(enrichedParts.map((p) => p.currentBalance)),
        totalMonthlyPayment: sumOf(enrichedParts.map((p) => p.monthlyPayment)),
        members: (membersOf.get(d.id) ?? []).map(({ groupName, role }) => ({ groupName, role })),
        isOwner: isOwnerOrAdmin(d, user),
        canEdit: editableSet.has(d.id),
      }
    }))
  })

  // What a part comes to (balance today, installment, term), computed like a saved one but saving nothing:
  // the add-part form shows it while it is being filled in, so a typo is seen before the part is created.
  app.post("/preview-part", validateJson(previewDebtPartSchema), (c) => {
    const { name: _name, ...part } = c.req.valid("json")
    return c.json(computePartState(part, []))
  })

  // Create
  app.post("/", validateJson(createDebtSchema), async (c) => {
    const { name, currency = "EUR" } = c.req.valid("json")
    const [debt] = await db.insert(debts).values({ name, currency, ownerSub: c.get("user").sub }).returning()
    return c.json(debt, 201)
  })

  // Update
  app.patch("/:id", validateJson(updateDebtSchema), async (c) => {
    const id = c.req.param("id")
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), id))) return c.json({ error: "Not found" }, 404)
    const body = c.req.valid("json")
    const updates: Partial<typeof debts.$inferInsert> = {}
    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.currency === "EUR" || body.currency === "USD") updates.currency = body.currency
    if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
    const [updated] = await db.update(debts).set(updates).where(eq(debts.id, id)).returning()
    return c.json(updated)
  })

  // Add part
  app.post("/:id/parts", validateJson(createDebtPartSchema), async (c) => {
    const debtId = c.req.param("id")
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const body = c.req.valid("json")
    const [part] = await db
      .insert(parts)
      .values({
        [fk]: debtId,
        name: body.name,
        type: body.type,
        principal: body.principal,
        annualInterestRate: body.annualInterestRate,
        rateType: body.rateType ?? "nominal",
        startDate: body.startDate,
        endDate: body.endDate,
        firstPaymentDate: body.firstPaymentDate ?? null,
      } as unknown as typeof parts.$inferInsert)
      .returning()
    return c.json(enrichPart(part, []), 201)
  })

  // Update part
  app.patch("/:id/parts/:pid", validateJson(updateDebtPartSchema), async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    if (!(await findPart(debtId, pid))) return c.json({ error: "Not found" }, 404)

    const body = c.req.valid("json")
    const updates: Partial<typeof parts.$inferInsert> = {}
    if (body.name?.trim()) updates.name = body.name.trim()
    if (body.annualInterestRate !== undefined) updates.annualInterestRate = body.annualInterestRate
    if (body.rateType !== undefined) updates.rateType = body.rateType
    if (body.endDate) updates.endDate = body.endDate
    if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

    const [updated] = await db.update(parts).set(updates).where(eq(parts.id, pid)).returning()
    const payments = await db.select().from(extraPayments).where(eq(extraPayments.partId, pid)).orderBy(extraPayments.paymentDate)
    return c.json(enrichPart(updated, payments))
  })

  // Delete part
  app.delete("/:id/parts/:pid", async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const deleted = await db.delete(parts).where(and(eq(parts.id, pid), eq(cfg.partDebtColumn, debtId))).returning()
    if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
    return c.body(null, 204)
  })

  // Add extra payment to a part
  app.post("/:id/parts/:pid/payments", validateJson(createDebtExtraPaymentSchema), async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    if (!(await findPart(debtId, pid))) return c.json({ error: "Not found" }, 404)
    const body = c.req.valid("json")
    const [payment] = await db
      .insert(extraPayments)
      .values({ partId: pid, paymentDate: body.paymentDate, amount: body.amount, notes: body.notes ?? null })
      .returning()
    return c.json(payment, 201)
  })

  // Delete extra payment
  app.delete("/:id/parts/:pid/payments/:paymentId", async (c) => {
    const { id: debtId, pid, paymentId } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    if (!(await findPart(debtId, pid))) return c.json({ error: "Not found" }, 404)
    const deleted = await db.delete(extraPayments).where(and(eq(extraPayments.id, paymentId), eq(extraPayments.partId, pid))).returning()
    if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
    return c.body(null, 204)
  })

  // delete the resource and manage who it is shared with (owner/admin only)
  mountOwnerRoutes(app, { resource: cfg.resource, canView: cfg.canView })

  return app
}
