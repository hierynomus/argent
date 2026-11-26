import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { db } from "../db"
import { mortgages, mortgageParts, mortgageExtraPayments, mortgagePartRates, mortgageMembers } from "../db/schema"
import { computePartState, extraPaymentImpact, instantOf } from "../services/amortization"
import { toAccessContext, type AccessContext } from "../services/accessControl"
import { Decimal, cents } from "../services/money"
import type { SharedResource } from "../services/sharedResources"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { groupBy } from "../lib/groupBy"
import { validateJson, validateQuery } from "../middleware/validate"
import { createDebtSchema, updateDebtSchema, createDebtPartSchema, updateDebtPartSchema, carryOverQuerySchema, closeDebtPartSchema, createDebtExtraPaymentSchema, createDebtPartSchema as createPartSchemaForCheck, createDebtRateSchema, previewDebtPartSchema } from "@argent/shared"

/**
 * Everything that differs between mortgages and loans: their tables (which have the same columns apart from
 * the name of the foreign key), the access checks and the shared-resource definition. The routes are one
 * implementation, `debtRoutes`.
 */
export interface DebtKindConfig {
  /** the tables, typed as the mortgage ones: the loan tables have exactly the same columns */
  tables: { debts: typeof mortgages; parts: typeof mortgageParts; payments: typeof mortgageExtraPayments; rates: typeof mortgagePartRates; members: typeof mortgageMembers }
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

function enrichPart(
  part: typeof mortgageParts.$inferSelect,
  payments: (typeof mortgageExtraPayments.$inferSelect)[],
  rates: (typeof mortgagePartRates.$inferSelect)[] = [],
) {
  return {
    ...part,
    extraPayments: payments.map((p) => ({ id: p.id, partId: p.partId, paymentDate: p.paymentDate, amount: p.amount, effect: p.effect, notes: p.notes, createdAt: p.createdAt })),
    rates: [...rates].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).map((r) => ({ id: r.id, partId: r.partId, effectiveDate: r.effectiveDate, annualInterestRate: r.annualInterestRate, rateType: r.rateType, createdAt: r.createdAt })),
    extraImpact: extraPaymentImpact(part, payments, new Date(), rates), // what the extra payments so far saved, or null
    ...computePartState(part, payments, new Date(), rates), // balance, payment components, term, projected end date and current rate
  }
}

const sumOf = (values: number[]) => cents(values.reduce((s, v) => s.plus(v), new Decimal(0)))

/** The router of a debt kind: list with computed amortization, create/update/delete, parts, extra payments, sharing. */
export function debtRoutes(cfg: DebtKindConfig) {
  const { debts, parts, payments: extraPayments, rates: partRates, members } = cfg.tables
  // the property name of the foreign key; typed as the mortgage one, at runtime it is `loanId` for loans
  const fk = cfg.foreignKey as "mortgageId"
  const app = new Hono<{ Variables: { user: AuthUser } }>()

  const findPart = async (debtId: string, partId: string) =>
    (await db.select().from(parts).where(and(eq(parts.id, partId), eq(cfg.partDebtColumn, debtId))).limit(1))[0]

  /** Insert a part (and its rate changes) of a debt; `continues` links it to the part whose remainder it continues. */
  async function insertPart(
    tx: Pick<typeof db, "insert">,
    debtId: string,
    body: { name: string; type: string; principal: string; annualInterestRate: string; rateType?: string; startDate: string; endDate: string; firstPaymentDate?: string; resetRecalculation?: string; rates?: Array<{ effectiveDate: string; annualInterestRate: string; rateType?: string }> },
    continues: string | null,
  ) {
    const [part] = await tx
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
        resetRecalculation: body.resetRecalculation ?? "contract",
        continuesPartId: continues,
      } as unknown as typeof parts.$inferInsert)
      .returning()
    const rates = (body.rates ?? []).length === 0
      ? []
      : await tx.insert(partRates).values((body.rates ?? []).map((r) => ({ partId: part.id, effectiveDate: r.effectiveDate, annualInterestRate: r.annualInterestRate, rateType: r.rateType ?? "nominal" }))).returning()
    return { part, rates }
  }

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
    const allRates = allParts.length === 0 ? [] : await db.select().from(partRates).where(inArray(partRates.partId, allParts.map((p) => p.id)))
    const allMembers = await db
      .select({ debtId: members[fk], groupName: members.groupName, role: members.role })
      .from(members)
      .where(inArray(cfg.memberDebtColumn, rowIds))
    const partsOf = groupBy(allParts, (p) => p[fk])
    const paymentsOf = groupBy(allPayments, (p) => p.partId)
    const ratesOf = groupBy(allRates, (r) => r.partId)
    const membersOf = groupBy(allMembers, (m) => m.debtId)

    return c.json(rows.map((d) => {
      const enrichedParts = (partsOf.get(d.id) ?? []).map((part) => enrichPart(part, paymentsOf.get(part.id) ?? [], ratesOf.get(part.id) ?? []))
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
    const { name: _name, rates = [], ...part } = c.req.valid("json")
    return c.json(computePartState(part, [], new Date(), rates))
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
    const { part, rates } = await db.transaction((tx) => insertPart(tx, debtId, body, null))
    return c.json(enrichPart(part, [], rates), 201)
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
    if (body.resetRecalculation !== undefined) updates.resetRecalculation = body.resetRecalculation
    if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

    const [updated] = await db.update(parts).set(updates).where(eq(parts.id, pid)).returning()
    const payments = await db.select().from(extraPayments).where(eq(extraPayments.partId, pid)).orderBy(extraPayments.paymentDate)
    const rates = await db.select().from(partRates).where(eq(partRates.partId, pid))
    return c.json(enrichPart(updated, payments, rates))
  })

  // Delete part
  app.delete("/:id/parts/:pid", async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const deleted = await db.delete(parts).where(and(eq(parts.id, pid), eq(cfg.partDebtColumn, debtId))).returning()
    if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
    return c.body(null, 204)
  })

  // What is left of a part on a day (the balance a continuation starts from)
  app.get("/:id/parts/:pid/carry-over", validateQuery(carryOverQuerySchema), async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canView(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const part = await findPart(debtId, pid)
    if (!part) return c.json({ error: "Not found" }, 404)
    const { date } = c.req.valid("query")
    const [payments, rates] = await Promise.all([
      db.select().from(extraPayments).where(eq(extraPayments.partId, pid)),
      db.select().from(partRates).where(eq(partRates.partId, pid)),
    ])
    const state = computePartState({ ...part, closedOn: null }, payments, instantOf(date), rates)
    return c.json({ date, balance: state.currentBalance })
  })

  // Close a part on the day its fixed-rate period ends: continue what is left in new parts, the rest is repaid
  app.post("/:id/parts/:pid/close", validateJson(closeDebtPartSchema), async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const part = await findPart(debtId, pid)
    if (!part) return c.json({ error: "Not found" }, 404)
    if (part.closedOn) return c.json({ error: "This part is already closed" }, 409)
    const body = c.req.valid("json")
    if (body.closedOn <= part.startDate || body.closedOn > part.endDate) {
      return c.json({ error: "A part can be closed after its start date and no later than its end date", issues: [{ path: "closedOn", message: "must be within the part's term" }] }, 400)
    }

    // each new part must be a valid part that starts the day the old one is closed
    for (const [i, next] of body.continuation.entries()) {
      const checked = createPartSchemaForCheck.safeParse({ ...next, startDate: body.closedOn })
      if (!checked.success) return c.json({ error: `Part ${i + 1}: ${checked.error.issues[0]?.message ?? "invalid"}`, issues: checked.error.issues }, 400)
    }

    const [payments, rates] = await Promise.all([
      db.select().from(extraPayments).where(eq(extraPayments.partId, pid)),
      db.select().from(partRates).where(eq(partRates.partId, pid)),
    ])
    const carriedOver = computePartState({ ...part, closedOn: null }, payments, instantOf(body.closedOn), rates).currentBalance
    const continued = body.continuation.reduce((s, n) => s.plus(n.principal), new Decimal(0))
    if (continued.greaterThan(new Decimal(carriedOver).toDecimalPlaces(2))) {
      return c.json({ error: `The new parts add up to more than what is left of this part on that day (${carriedOver.toFixed(2)})`, issues: [{ path: "continuation", message: "exceeds the balance" }] }, 400)
    }

    const created = await db.transaction(async (tx) => {
      await tx.update(parts).set({ closedOn: body.closedOn }).where(eq(parts.id, pid))
      const made = []
      for (const next of body.continuation) made.push(await insertPart(tx, debtId, { ...next, startDate: body.closedOn }, pid))
      return made
    })
    const [closed] = await db.select().from(parts).where(eq(parts.id, pid))
    return c.json({
      closed: enrichPart(closed, payments, rates),
      created: created.map((x) => enrichPart(x.part, [], x.rates)),
      carriedOver,
      repaid: cents(new Decimal(carriedOver).minus(continued)),
    }, 201)
  })

  // Reopen a closed part (the parts that continued it stay: remove them separately)
  app.delete("/:id/parts/:pid/close", async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const part = await findPart(debtId, pid)
    if (!part) return c.json({ error: "Not found" }, 404)
    if (!part.closedOn) return c.json({ error: "This part is not closed" }, 409)
    await db.update(parts).set({ closedOn: null }).where(eq(parts.id, pid))
    return c.body(null, 204)
  })

  // Add a rate change to a part: from this date on (the end of a fixed-rate period) it runs at the new rate
  app.post("/:id/parts/:pid/rates", validateJson(createDebtRateSchema), async (c) => {
    const { id: debtId, pid } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    const part = await findPart(debtId, pid)
    if (!part) return c.json({ error: "Not found" }, 404)
    const body = c.req.valid("json")
    if (body.effectiveDate <= part.startDate || body.effectiveDate > part.endDate) {
      return c.json({ error: "The new rate must start after the part's start date and no later than its end date", issues: [{ path: "effectiveDate", message: "must be within the part's term" }] }, 400)
    }
    const taken = await db.select({ id: partRates.id }).from(partRates).where(and(eq(partRates.partId, pid), eq(partRates.effectiveDate, body.effectiveDate))).limit(1)
    if (taken.length > 0) return c.json({ error: "There is already a rate change on that date" }, 409)
    const [rate] = await db
      .insert(partRates)
      .values({ partId: pid, effectiveDate: body.effectiveDate, annualInterestRate: body.annualInterestRate, rateType: body.rateType ?? "nominal" })
      .returning()
    return c.json(rate, 201)
  })

  // Remove a rate change
  app.delete("/:id/parts/:pid/rates/:rateId", async (c) => {
    const { id: debtId, pid, rateId } = c.req.param()
    if (!(await cfg.canEdit(toAccessContext(c.get("user")), debtId))) return c.json({ error: "Not found" }, 404)
    if (!(await findPart(debtId, pid))) return c.json({ error: "Not found" }, 404)
    const deleted = await db.delete(partRates).where(and(eq(partRates.id, rateId), eq(partRates.partId, pid))).returning()
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
      .values({ partId: pid, paymentDate: body.paymentDate, amount: body.amount, effect: body.effect ?? "shorten_term", notes: body.notes ?? null })
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
