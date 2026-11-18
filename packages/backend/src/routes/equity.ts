import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { equityGrants, equityPlanMembers, equityPlans, equityPrices } from "../db/schema"
import { canEditEquityPlan, getEditableEquityPlanIds, getViewableEquityPlanIds, toAccessContext } from "../services/accessControl"
import { currentPriceOf, nextVestingDate, valuePerOption, vestedOptions } from "../services/equity"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { groupBy } from "../lib/groupBy"
import { formatIssues, validateJson } from "../middleware/validate"
import {
  addMemberSchema, createEquityGrantSchema, createEquityPlanSchema, createEquityPriceSchema, updateEquityGrantSchema, updateEquityPlanSchema,
  type EquityGrantWithState, type EquityPlanWithDetails, type VestingType,
} from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const today = () => new Date().toISOString().slice(0, 10)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const sumOrNull = (xs: Array<number | null>) => (xs.some((x) => x === null) ? null : sum(xs as number[]))

/** The plans with the given ids as the API returns them: prices, grants with their vesting state, totals. */
async function load(user: AuthUser, ids: string[]): Promise<EquityPlanWithDetails[]> {
  if (ids.length === 0) return []
  const editable = new Set(await getEditableEquityPlanIds(toAccessContext(user)))
  const rows = await db.select().from(equityPlans).where(inArray(equityPlans.id, ids)).orderBy(equityPlans.name)
  const [grantRows, priceRows, memberRows] = await Promise.all([
    db.select().from(equityGrants).where(inArray(equityGrants.planId, ids)).orderBy(equityGrants.grantDate, equityGrants.createdAt),
    db.select().from(equityPrices).where(inArray(equityPrices.planId, ids)).orderBy(equityPrices.priceDate, equityPrices.createdAt),
    db.select().from(equityPlanMembers).where(inArray(equityPlanMembers.planId, ids)),
  ])
  const grantsOf = groupBy(grantRows, (g) => g.planId)
  const pricesOf = groupBy(priceRows, (p) => p.planId)
  const membersOf = groupBy(memberRows, (m) => m.planId)
  const now = today()

  return rows.map((plan) => {
    const prices = pricesOf.get(plan.id) ?? []
    const { price, date } = currentPriceOf(prices, now)
    const grants: EquityGrantWithState[] = (grantsOf.get(plan.id) ?? []).map((g) => {
      const options = parseFloat(g.options)
      const input = { options, vestingType: g.vestingType, vestStart: g.vestStart, cliffMonths: g.cliffMonths, vestMonths: g.vestMonths }
      const isTime = g.vestingType === "time"
      const vested = vestedOptions(input, now)
      const unvested = isTime ? Math.round((options - vested) * 100) / 100 : 0
      const onExit = isTime ? 0 : options
      const per = valuePerOption(price, parseFloat(g.strikePrice))
      return {
        ...g,
        vestingType: g.vestingType as VestingType,
        createdAt: g.createdAt.toISOString(),
        vested,
        unvested,
        onExit,
        nextVestingDate: nextVestingDate(input, now),
        valuePerOption: per,
        vestedValue: per === null ? null : vested * per,
        unvestedValue: per === null ? null : unvested * per,
        onExitValue: per === null ? null : onExit * per,
      }
    })
    return {
      id: plan.id,
      name: plan.name,
      ownerSub: plan.ownerSub,
      currency: plan.currency,
      createdAt: plan.createdAt.toISOString(),
      prices: prices.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      currentPrice: price,
      currentPriceDate: date,
      grants,
      totals: {
        granted: sum(grants.map((g) => parseFloat(g.options))),
        vested: sum(grants.map((g) => g.vested)),
        unvested: sum(grants.map((g) => g.unvested)),
        onExit: sum(grants.map((g) => g.onExit)),
        vestedValue: price === null ? null : sumOrNull(grants.map((g) => g.vestedValue)) ?? 0,
        unvestedValue: price === null ? null : sumOrNull(grants.map((g) => g.unvestedValue)) ?? 0,
        onExitValue: price === null ? null : sumOrNull(grants.map((g) => g.onExitValue)) ?? 0,
      },
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
  return c.json(await load(user, await getViewableEquityPlanIds(toAccessContext(user))))
})

// Create a plan (one per company)
app.post("/", validateJson(createEquityPlanSchema), async (c) => {
  const user = c.get("user")
  const { name, currency } = c.req.valid("json")
  const [created] = await db.insert(equityPlans).values({ name, currency: currency ?? "EUR", ownerSub: user.sub }).returning()
  return c.json(await loadOne(user, created.id), 201)
})

// Rename a plan / change its currency
app.patch("/:id", validateJson(updateEquityPlanSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditEquityPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  const updates: Partial<typeof equityPlans.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.currency) updates.currency = body.currency
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
  await db.update(equityPlans).set(updates).where(eq(equityPlans.id, id))
  return c.json(await loadOne(user, id))
})

// Delete a plan (owner-only) with its grants and prices
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const existing = await db.query.equityPlans.findFirst({ where: (p, { eq }) => eq(p.id, id) })
  if (!existing) return c.json({ error: "Not found" }, 404)
  if (!isOwnerOrAdmin(existing, user)) return c.json({ error: "Forbidden" }, 403)
  await db.delete(equityPlans).where(eq(equityPlans.id, id))
  return c.body(null, 204)
})

/** Grant fields as stored: exit-only grants carry no vesting schedule. */
function grantValues(g: { label?: string; grantDate: string; options: string; strikePrice: string; vestingType?: VestingType; vestStart?: string; cliffMonths?: number; vestMonths?: number }) {
  const time = (g.vestingType ?? "time") === "time"
  return {
    label: g.label?.trim() || null,
    grantDate: g.grantDate,
    options: g.options,
    strikePrice: g.strikePrice,
    vestingType: g.vestingType ?? "time",
    vestStart: time ? g.vestStart ?? null : null,
    cliffMonths: time ? g.cliffMonths ?? 0 : 0,
    vestMonths: time ? g.vestMonths ?? null : null,
  }
}

// Add a grant
app.post("/:id/grants", validateJson(createEquityGrantSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditEquityPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  await db.insert(equityGrants).values({ planId: id, ...grantValues(c.req.valid("json")) })
  return c.json(await loadOne(user, id), 201)
})

// Correct a grant: the result must still be a valid grant as a whole
app.patch("/:id/grants/:gid", validateJson(updateEquityGrantSchema), async (c) => {
  const user = c.get("user")
  const { id, gid } = c.req.param()
  if (!(await canEditEquityPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const existing = await db.query.equityGrants.findFirst({ where: (g, { and, eq }) => and(eq(g.id, gid), eq(g.planId, id)) })
  if (!existing) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")
  const merged = createEquityGrantSchema.safeParse({
    label: existing.label ?? undefined,
    grantDate: existing.grantDate,
    options: existing.options,
    strikePrice: existing.strikePrice,
    vestingType: existing.vestingType,
    vestStart: existing.vestStart ?? undefined,
    cliffMonths: existing.cliffMonths,
    vestMonths: existing.vestMonths ?? undefined,
    ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
  })
  if (!merged.success) return c.json({ error: formatIssues(merged.error), issues: merged.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400)
  await db.update(equityGrants).set(grantValues(merged.data)).where(eq(equityGrants.id, gid))
  return c.json(await loadOne(user, id))
})

// Delete a grant
app.delete("/:id/grants/:gid", async (c) => {
  const user = c.get("user")
  const { id, gid } = c.req.param()
  if (!(await canEditEquityPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(equityGrants).where(and(eq(equityGrants.id, gid), eq(equityGrants.planId, id))).returning({ id: equityGrants.id })
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// Add a share price (a funding round, a valuation)
app.post("/:id/prices", validateJson(createEquityPriceSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditEquityPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  await db.insert(equityPrices).values({ planId: id, priceDate: body.priceDate, price: body.price, note: body.note?.trim() || null })
  return c.json(await loadOne(user, id), 201)
})

// Delete a share price
app.delete("/:id/prices/:pid", async (c) => {
  const user = c.get("user")
  const { id, pid } = c.req.param()
  if (!(await canEditEquityPlan(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(equityPrices).where(and(eq(equityPrices.id, pid), eq(equityPrices.planId, id))).returning({ id: equityPrices.id })
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// Add/update member (owner-only)
app.post("/:id/members", validateJson(addMemberSchema), async (c) => {
  const user = c.get("user")
  const planId = c.req.param("id")
  const plan = await db.query.equityPlans.findFirst({ where: (p, { eq }) => eq(p.id, planId) })
  if (!plan) return c.json({ error: "Not found" }, 404)
  if (!isOwnerOrAdmin(plan, user)) return c.json({ error: "Forbidden" }, 403)
  const body = c.req.valid("json")
  const role = body.role ?? "viewer"
  await db
    .insert(equityPlanMembers)
    .values({ planId, groupName: body.groupName.trim(), role })
    .onConflictDoUpdate({ target: [equityPlanMembers.planId, equityPlanMembers.groupName], set: { role } })
  return c.json({ groupName: body.groupName.trim(), role }, 201)
})

// Remove member (owner-only)
app.delete("/:id/members/:groupName", async (c) => {
  const user = c.get("user")
  const { id: planId, groupName } = c.req.param()
  const plan = await db.query.equityPlans.findFirst({ where: (p, { eq }) => eq(p.id, planId) })
  if (!plan) return c.json({ error: "Not found" }, 404)
  if (!isOwnerOrAdmin(plan, user)) return c.json({ error: "Forbidden" }, 403)
  await db.delete(equityPlanMembers).where(and(eq(equityPlanMembers.planId, planId), eq(equityPlanMembers.groupName, groupName)))
  return c.body(null, 204)
})

export default app
