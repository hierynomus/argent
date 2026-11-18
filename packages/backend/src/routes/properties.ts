import { Hono } from "hono"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { properties, propertyLoans, propertyMembers, propertyMortgages, propertyValuations } from "../db/schema"
import { canEditProperty, getEditablePropertyIds, getViewableLoanIds, getViewableMortgageIds, getViewablePropertyIds, toAccessContext, canViewProperty } from "../services/accessControl"
import { currentValueOf, getLiabilities } from "../services/property"
import type { AuthUser } from "../middleware/auth"
import { isOwnerOrAdmin } from "../middleware/guards"
import { mountOwnerRoutes } from "./ownerRoutes"
import { propertyResource } from "../services/sharedResources"
import { groupBy } from "../lib/groupBy"
import { validateJson } from "../middleware/validate"
import { createPropertySchema, createPropertyValuationSchema, setPropertyLinksSchema, updatePropertySchema, type PropertyWithDetails } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The properties with the given ids, in the shape the API returns: valuations, the current value, and the
 * linked liabilities the user may see with what is still owed on them. (As for mortgages, the list is the
 * read model: there is no GET /:id.)
 */
async function load(user: AuthUser, ids: string[]): Promise<PropertyWithDetails[]> {
  if (ids.length === 0) return []
  const ctx = toAccessContext(user)
  const [editableIds, viewableMortgages, viewableLoans] = await Promise.all([getEditablePropertyIds(ctx), getViewableMortgageIds(ctx), getViewableLoanIds(ctx)])
  const editable = new Set(editableIds)

  const rows = await db.select().from(properties).where(inArray(properties.id, ids)).orderBy(properties.name)
  const [valuationRows, memberRows, mortgageLinks, loanLinks] = await Promise.all([
    db.select().from(propertyValuations).where(inArray(propertyValuations.propertyId, ids)).orderBy(propertyValuations.valuationDate, propertyValuations.createdAt),
    db.select().from(propertyMembers).where(inArray(propertyMembers.propertyId, ids)),
    db.select().from(propertyMortgages).where(inArray(propertyMortgages.propertyId, ids)),
    db.select().from(propertyLoans).where(inArray(propertyLoans.propertyId, ids)),
  ])
  // only liabilities the user can see count (and are shown)
  const visibleMortgages = new Set(viewableMortgages)
  const visibleLoans = new Set(viewableLoans)
  const mortgageIds = [...new Set(mortgageLinks.map((l) => l.mortgageId).filter((id) => visibleMortgages.has(id)))]
  const loanIds = [...new Set(loanLinks.map((l) => l.loanId).filter((id) => visibleLoans.has(id)))]
  const [mortgageDebts, loanDebts] = await Promise.all([getLiabilities("mortgage", mortgageIds), getLiabilities("loan", loanIds)])

  const valuationsOf = groupBy(valuationRows, (v) => v.propertyId)
  const membersOf = groupBy(memberRows, (m) => m.propertyId)
  const mortgagesOf = groupBy(mortgageLinks, (l) => l.propertyId)
  const loansOf = groupBy(loanLinks, (l) => l.propertyId)
  const now = today()

  return rows.map((p) => {
    const valuations = valuationsOf.get(p.id) ?? []
    const liabilities = [
      ...(mortgagesOf.get(p.id) ?? []).map((l) => mortgageDebts.get(l.mortgageId)),
      ...(loansOf.get(p.id) ?? []).map((l) => loanDebts.get(l.loanId)),
    ].filter((l): l is NonNullable<typeof l> => !!l)
    const { value, date } = currentValueOf(valuations, { price: p.purchasePrice, date: p.purchaseDate }, now)
    const debt = liabilities.reduce((s, l) => s + l.balance, 0)
    return {
      ...p,
      type: p.type as PropertyWithDetails["type"],
      createdAt: p.createdAt.toISOString(),
      valuations: valuations.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
      currentValue: value,
      currentValueDate: date,
      gainSincePurchase: value !== null && p.purchasePrice !== null ? value - parseFloat(p.purchasePrice) : null,
      liabilities,
      debt,
      equity: value === null ? null : value - debt,
      members: (membersOf.get(p.id) ?? []).map(({ groupName, role }) => ({ groupName, role: role as "viewer" | "editor" })),
      isOwner: isOwnerOrAdmin(p, user),
      canEdit: editable.has(p.id),
    }
  })
}

// List all properties the user can see
app.get("/", async (c) => {
  const user = c.get("user")
  return c.json(await load(user, await getViewablePropertyIds(toAccessContext(user))))
})

// Create a property (optionally with its purchase and a first valuation of today's value)
app.post("/", validateJson(createPropertySchema), async (c) => {
  const user = c.get("user")
  const body = c.req.valid("json")
  const [created] = await db
    .insert(properties)
    .values({
      name: body.name,
      type: body.type ?? "house",
      currency: body.currency ?? "EUR",
      ownerSub: user.sub,
      purchasePrice: body.purchasePrice ?? null,
      purchaseDate: body.purchaseDate ?? null,
    })
    .returning()
  if (body.currentValue) {
    await db.insert(propertyValuations).values({ propertyId: created.id, valuationDate: today(), value: body.currentValue, note: "Initial estimate" })
  }
  return c.json((await load(user, [created.id]))[0], 201)
})

// Update a property
app.patch("/:id", validateJson(updatePropertySchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditProperty(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  const updates: Partial<typeof properties.$inferInsert> = {}
  if (body.name?.trim()) updates.name = body.name.trim()
  if (body.type) updates.type = body.type
  if (body.purchasePrice !== undefined) updates.purchasePrice = body.purchasePrice
  if (body.purchaseDate !== undefined) updates.purchaseDate = body.purchaseDate
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
  await db.update(properties).set(updates).where(eq(properties.id, id))
  return c.json((await load(user, [id]))[0])
})

// Add a valuation
app.post("/:id/valuations", validateJson(createPropertyValuationSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canEditProperty(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const body = c.req.valid("json")
  const [valuation] = await db
    .insert(propertyValuations)
    .values({ propertyId: id, valuationDate: body.valuationDate, value: body.value, note: body.note?.trim() || null })
    .returning()
  return c.json({ ...valuation, createdAt: valuation.createdAt.toISOString() }, 201)
})

// Delete a valuation
app.delete("/:id/valuations/:vid", async (c) => {
  const user = c.get("user")
  const { id, vid } = c.req.param()
  if (!(await canEditProperty(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const deleted = await db.delete(propertyValuations).where(and(eq(propertyValuations.id, vid), eq(propertyValuations.propertyId, id))).returning({ id: propertyValuations.id })
  if (deleted.length === 0) return c.json({ error: "Not found" }, 404)
  return c.body(null, 204)
})

// Set which mortgages and loans finance the property. Only liabilities the user can see are considered:
// links to ones they cannot see are neither shown nor touched.
app.put("/:id/links", validateJson(setPropertyLinksSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const ctx = toAccessContext(user)
  if (!(await canEditProperty(ctx, id))) return c.json({ error: "Not found" }, 404)
  const { mortgageIds, loanIds } = c.req.valid("json")

  const [visibleMortgages, visibleLoans] = await Promise.all([getViewableMortgageIds(ctx), getViewableLoanIds(ctx)])
  const unknownMortgage = mortgageIds.find((m) => !visibleMortgages.includes(m))
  if (unknownMortgage) return c.json({ error: `Mortgage ${unknownMortgage} not found` }, 400)
  const unknownLoan = loanIds.find((l) => !visibleLoans.includes(l))
  if (unknownLoan) return c.json({ error: `Loan ${unknownLoan} not found` }, 400)

  await db.transaction(async (tx) => {
    if (visibleMortgages.length > 0) await tx.delete(propertyMortgages).where(and(eq(propertyMortgages.propertyId, id), inArray(propertyMortgages.mortgageId, visibleMortgages)))
    if (visibleLoans.length > 0) await tx.delete(propertyLoans).where(and(eq(propertyLoans.propertyId, id), inArray(propertyLoans.loanId, visibleLoans)))
    const uniqueMortgages = [...new Set(mortgageIds)]
    const uniqueLoans = [...new Set(loanIds)]
    if (uniqueMortgages.length > 0) await tx.insert(propertyMortgages).values(uniqueMortgages.map((mortgageId) => ({ propertyId: id, mortgageId })))
    if (uniqueLoans.length > 0) await tx.insert(propertyLoans).values(uniqueLoans.map((loanId) => ({ propertyId: id, loanId })))
  })
  return c.json((await load(user, [id]))[0])
})

// delete the resource and manage who it is shared with (owner/admin only)
mountOwnerRoutes(app, { resource: propertyResource, canView: canViewProperty })

export default app
