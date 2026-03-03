import { Hono } from "hono"
import { and, asc, count, desc, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { subscriptions, transactions } from "../db/schema"
import { detectSubscriptions } from "../services/subscriptionDetector"
import { getViewableAccountIds, getEditableAccountIds } from "../services/accessControl"
import type { UpdateSubscriptionBody } from "@argent/shared"
import type { AuthUser } from "../middleware/auth"

const app = new Hono<{ Variables: { user: AuthUser } }>()

// GET /api/subscriptions — list accessible subscriptions with transaction count
app.get("/", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getViewableAccountIds({ groups: user.groups ?? [], sub: user.sub, isAdmin: user.isAdmin })
  if (accessibleIds.length === 0) return c.json([])

  const rows = await db
    .select({
      id: subscriptions.id,
      accountId: subscriptions.accountId,
      name: subscriptions.name,
      counterpartyIban: subscriptions.counterpartyIban,
      counterpartyName: subscriptions.counterpartyName,
      medianAmount: subscriptions.medianAmount,
      currency: subscriptions.currency,
      intervalDays: subscriptions.intervalDays,
      intervalLabel: subscriptions.intervalLabel,
      nextExpectedDate: subscriptions.nextExpectedDate,
      lastSeenDate: subscriptions.lastSeenDate,
      isActive: subscriptions.isActive,
      createdAt: subscriptions.createdAt,
      transactionCount: count(transactions.id),
    })
    .from(subscriptions)
    .leftJoin(transactions, eq(transactions.subscriptionId, subscriptions.id))
    .where(inArray(subscriptions.accountId, accessibleIds))
    .groupBy(subscriptions.id)
    .orderBy(desc(subscriptions.isActive), asc(subscriptions.counterpartyName))

  return c.json(rows)
})

// PATCH /api/subscriptions/:id — update name / isActive
app.patch("/:id", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getEditableAccountIds({ groups: user.groups ?? [], sub: user.sub, isAdmin: user.isAdmin })
  const id = c.req.param("id")

  const sub = await db.query.subscriptions.findFirst({ where: (s, { eq }) => eq(s.id, id) })
  if (!sub || !accessibleIds.includes(sub.accountId)) return c.json({ error: "Not found" }, 404)

  const body = await c.req.json<UpdateSubscriptionBody>()

  const updates: Partial<typeof subscriptions.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.isActive !== undefined) updates.isActive = body.isActive

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400)
  }

  const [updated] = await db
    .update(subscriptions)
    .set(updates)
    .where(eq(subscriptions.id, id))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// DELETE /api/subscriptions/:id — unlink transactions, then delete
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getEditableAccountIds({ groups: user.groups ?? [], sub: user.sub, isAdmin: user.isAdmin })
  const id = c.req.param("id")

  const sub = await db.query.subscriptions.findFirst({ where: (s, { eq }) => eq(s.id, id) })
  if (!sub || !accessibleIds.includes(sub.accountId)) return c.json({ error: "Not found" }, 404)

  await db.update(transactions).set({ subscriptionId: null }).where(eq(transactions.subscriptionId, id))

  await db.delete(subscriptions).where(eq(subscriptions.id, id))
  return c.body(null, 204)
})

// POST /api/subscriptions/detect — manual trigger
app.post("/detect", async (c) => {
  const detected = await detectSubscriptions()
  return c.json({ detected })
})

// GET /api/subscriptions/:id/transactions — linked transactions for a subscription
app.get("/:id/transactions", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getViewableAccountIds({ groups: user.groups ?? [], sub: user.sub, isAdmin: user.isAdmin })
  const id = c.req.param("id")

  const sub = await db.query.subscriptions.findFirst({ where: (s, { eq }) => eq(s.id, id) })
  if (!sub || !accessibleIds.includes(sub.accountId)) return c.json({ error: "Not found" }, 404)

  const rows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      amount: transactions.amount,
      currency: transactions.currency,
      creditDebitIndicator: transactions.creditDebitIndicator,
      description: transactions.description,
    })
    .from(transactions)
    .where(eq(transactions.subscriptionId, id))
    .orderBy(desc(transactions.bookingDate))

  return c.json(rows)
})

export default app
