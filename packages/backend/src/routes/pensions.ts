import { Hono } from "hono"
import { and, eq, inArray, or } from "drizzle-orm"
import { db } from "../db"
import { pensionPlanMembers, pensionPlans, pensionStatements, pensionTransfers } from "../db/schema"
import { canEditPensionPlan, canViewPensionPlan, getEditablePensionPlanIds, getViewablePensionPlanIds, toAccessContext } from "../services/accessControl"
import { countsByDefault, latestStatementOf, netWorthValueOf, planState } from "../services/pension"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { pensionResource } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { validateJson } from "../middleware/validate"
import { todayIso } from "../lib/dates"
import {
  createPensionPlanSchema, createPensionStatementSchema, createPensionTransferSchema, updatePensionPlanSchema,
  type PensionKind, type PensionPlanWithDetails,
} from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const num = (v: string | null) => (v === null ? null : parseFloat(v))

/**
 * The plans with the given ids, in the shape the API returns: statements, what the latest one says, the state
 * (active/frozen/closed) and the transfers on either side. There is no GET /:id: the list is the read model.
 */
async function load(user: AuthUser, ids: string[]): Promise<PensionPlanWithDetails[]> {
  if (ids.length === 0) return []
  const ctx = toAccessContext(user)
  const [editableIds, viewableIds] = await Promise.all([getEditablePensionPlanIds(ctx), getViewablePensionPlanIds(ctx)])
  const editable = new Set(editableIds)
  const viewable = new Set(viewableIds)

  const rows = await db.select().from(pensionPlans).where(inArray(pensionPlans.id, ids)).orderBy(pensionPlans.name)
  const [statementRows, memberRows, transferRows] = await Promise.all([
    db.select().from(pensionStatements).where(inArray(pensionStatements.planId, ids)).orderBy(pensionStatements.statementDate, pensionStatements.createdAt),
    db.select().from(pensionPlanMembers).where(inArray(pensionPlanMembers.planId, ids)),
    db.select().from(pensionTransfers).where(or(inArray(pensionTransfers.fromPlanId, ids), inArray(pensionTransfers.toPlanId, ids))).orderBy(pensionTransfers.transferDate, pensionTransfers.createdAt),
  ])
  // the name of the plan on the other side of a transfer, only when the user may see it
  const otherIds = [...new Set(transferRows.flatMap((t) => [t.fromPlanId, t.toPlanId]))].filter((id) => viewable.has(id))
  const names = new Map(otherIds.length === 0 ? [] : (await db.select({ id: pensionPlans.id, name: pensionPlans.name }).from(pensionPlans).where(inArray(pensionPlans.id, otherIds))).map((p) => [p.id, p.name]))

  const statementsOf = groupBy(statementRows, (s) => s.planId)
  const membersOf = groupBy(memberRows, (m) => m.planId)
  const now = todayIso()

  return rows.map((plan) => {
    const statements = (statementsOf.get(plan.id) ?? []).map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))
    const latest = latestStatementOf(statements, now)
    const state = planState(plan, now)
    const capital = num(latest?.capital ?? null)
    const accruedIncome = num(latest?.accruedIncome ?? null)
    const expected = num(latest?.projectedExpected ?? null)
    return {
      id: plan.id,
      name: plan.name,
      provider: plan.provider,
      kind: plan.kind as PensionKind,
      status: plan.status as "active" | "frozen",
      state,
      closedOn: plan.closedOn,
      ownerSub: plan.ownerSub,
      currency: plan.currency,
      retirementDate: plan.retirementDate,
      countInNetWorth: plan.countInNetWorth,
      createdAt: plan.createdAt.toISOString(),
      statements,
      latestStatement: latest,
      capital,
      accruedIncome,
      expectedIncome: expected ?? accruedIncome,
      incomeLow: num(latest?.projectedLow ?? null),
      incomeHigh: num(latest?.projectedHigh ?? null),
      partnerIncome: num(latest?.partnerIncome ?? null),
      incomeInTodaysMoney: latest?.inTodaysMoney ?? true,
      netWorthValue: netWorthValueOf({ countInNetWorth: plan.countInNetWorth, state }, capital),
      transfers: transferRows
        .filter((t) => t.fromPlanId === plan.id || t.toPlanId === plan.id)
        .map((t) => ({ ...t, kind: t.kind as "transfer" | "conversion", fromPlanName: names.get(t.fromPlanId) ?? null, toPlanName: names.get(t.toPlanId) ?? null, createdAt: t.createdAt.toISOString() })),
      members: (membersOf.get(plan.id) ?? []).map(({ groupName, role }) => ({ groupName, role: role as "viewer" | "editor" })),
      isOwner: isOwnerOrAdmin(plan, user),
      canEdit: editable.has(plan.id),
    }
  })
}

const loadOne = async (user: AuthUser, id: string) => (await load(user, [id]))[0]

// List all plans the user can see
app.get("/", async (c) => {
  const user = c.get("user")
  return c.json(await load(user, await getViewablePensionPlanIds(toAccessContext(user))))
})

// Create a plan
app.post("/", validateJson(createPensionPlanSchema), async (c) => {
  const user = c.get("user")
  const body = c.req.valid("json")
  const [created] = await db
    .insert(pensionPlans)
    .values({
      name: body.name,
      kind: body.kind,
      provider: body.provider?.trim() || null,
      currency: body.currency ?? "EUR",
      status: body.status ?? "active",
      retirementDate: body.retirementDate ?? null,
      countInNetWorth: body.countInNetWorth ?? countsByDefault(body.kind),
      ownerSub: user.sub,
    })
    .returning()
  return c.json(await loadOne(user, created.id), 201)
})

// Edit a plan: rename, change its status, close or reopen it
app.patch("/:id", validateJson(updatePensionPlanSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditPensionPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  const updates: Partial<typeof pensionPlans.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.kind) updates.kind = body.kind
  if (body.provider !== undefined) updates.provider = body.provider?.trim() || null
  if (body.status) updates.status = body.status
  if (body.closedOn !== undefined) updates.closedOn = body.closedOn
  if (body.retirementDate !== undefined) updates.retirementDate = body.retirementDate
  if (body.countInNetWorth !== undefined) updates.countInNetWorth = body.countInNetWorth
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
  await db.update(pensionPlans).set(updates).where(eq(pensionPlans.id, id))
  return c.json(await loadOne(user, id))
})

// Add a statement
app.post("/:id/statements", validateJson(createPensionStatementSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditPensionPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const b = c.req.valid("json")
  await db.insert(pensionStatements).values({
    planId: id,
    statementDate: b.statementDate,
    capital: b.capital ?? null,
    accruedIncome: b.accruedIncome ?? null,
    projectedLow: b.projectedLow ?? null,
    projectedExpected: b.projectedExpected ?? null,
    projectedHigh: b.projectedHigh ?? null,
    partnerIncome: b.partnerIncome ?? null,
    inTodaysMoney: b.inTodaysMoney ?? true,
    note: b.note?.trim() || null,
  })
  return c.json(await loadOne(user, id), 201)
})

// Delete a statement
app.delete("/:id/statements/:sid", async (c) => {
  const user = c.get("user")
  const { id, sid } = c.req.param()
  if (!(await canEditPensionPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(pensionStatements).where(and(eq(pensionStatements.id, sid), eq(pensionStatements.planId, id))).returning({ id: pensionStatements.id })
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// Record value or rights moving from one plan to another (a job change, the switch to the new pension system).
// The user must be able to edit both plans. By default the old plan is closed on the transfer date.
app.post("/transfers", validateJson(createPensionTransferSchema), async (c) => {
  const user = c.get("user")
  const ctx = toAccessContext(user)
  const b = c.req.valid("json")
  for (const planId of [b.fromPlanId, b.toPlanId]) if (!(await canEditPensionPlan(ctx, planId))) return c.json({ error: "Plan not found" }, 404)
  await db.transaction(async (tx) => {
    await tx.insert(pensionTransfers).values({
      fromPlanId: b.fromPlanId,
      toPlanId: b.toPlanId,
      transferDate: b.transferDate,
      kind: b.kind,
      capital: b.capital ?? null,
      incomeGivenUp: b.incomeGivenUp ?? null,
      note: b.note?.trim() || null,
    })
    if (b.closeFrom ?? true) await tx.update(pensionPlans).set({ closedOn: b.transferDate }).where(eq(pensionPlans.id, b.fromPlanId))
  })
  return c.json(await load(user, [b.fromPlanId, b.toPlanId]), 201)
})

// Delete a transfer (the old plan stays closed: reopen it by clearing its closing date)
app.delete("/transfers/:tid", async (c) => {
  const user = c.get("user")
  const ctx = toAccessContext(user)
  const transfer = await db.query.pensionTransfers.findFirst({ where: (t, { eq }) => eq(t.id, c.req.param("tid")) })
  if (!transfer) return c.json({ error: "Not found" }, 404)
  // every side that still exists must be one the user can edit
  const existing = await db.select({ id: pensionPlans.id }).from(pensionPlans).where(inArray(pensionPlans.id, [transfer.fromPlanId, transfer.toPlanId]))
  if (existing.length === 0 || !(await Promise.all(existing.map((p) => canEditPensionPlan(ctx, p.id)))).every(Boolean)) return c.json({ error: "Not found" }, 404)
  await db.delete(pensionTransfers).where(eq(pensionTransfers.id, transfer.id))
  return c.body(null, 204)
})

// delete the resource and manage who it is shared with (owner/admin only)
mountOwnerRoutes(app, { resource: pensionResource, canView: canViewPensionPlan })

export default app
