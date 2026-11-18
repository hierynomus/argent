import { Hono } from "hono"
import { and, asc, count, desc, eq, inArray, ne, isNull } from "drizzle-orm"
import { db } from "../db"
import { subscriptions, transactions } from "../db/schema"
import {
  detectSubscriptions,
  computeStatsFromTransactions,
} from "../services/subscriptionDetector"
import { getViewableAccountIds, toAccessContext, canEditAccount, canViewAccount } from "../services/accessControl"
import type { UpdateSubscriptionBody, CreateSubscriptionBody } from "@argent/shared"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createSubscriptionSchema, updateSubscriptionSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

// GET /api/subscriptions — list accessible subscriptions (excluding dismissed)
app.get("/", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getViewableAccountIds(toAccessContext(user))
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
      status: subscriptions.status,
      createdAt: subscriptions.createdAt,
      transactionCount: count(transactions.id),
    })
    .from(subscriptions)
    .leftJoin(transactions, eq(transactions.subscriptionId, subscriptions.id))
    .where(
      and(
        inArray(subscriptions.accountId, accessibleIds),
        ne(subscriptions.status, "dismissed"),
      )
    )
    .groupBy(subscriptions.id)
    .orderBy(desc(subscriptions.isActive), asc(subscriptions.counterpartyName))

  return c.json(rows)
})

// POST /api/subscriptions — manually create a confirmed subscription
app.post("/", validateJson(createSubscriptionSchema), async (c) => {
  const user = c.get("user")
  const access = toAccessContext(user)

  const body = c.req.valid("json")
  if (!(await canEditAccount(access, body.accountId))) return c.json({ error: "Forbidden" }, 403)
  const counterpartyIban = body.counterpartyIban.trim()

  // Check for existing record with this (accountId, counterpartyIban)
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.accountId, body.accountId),
        eq(subscriptions.counterpartyIban, counterpartyIban),
      )
    )
    .limit(1)

  if (existing && (existing.status === "confirmed" || existing.status === "candidate")) {
    return c.json({ error: "A subscription for this account + IBAN already exists" }, 409)
  }

  // Find all matching DBIT transactions (for stats + linking)
  const txs = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, body.accountId),
        eq(transactions.counterpartyIban, counterpartyIban),
        eq(transactions.creditDebitIndicator, "DBIT"),
        isNull(transactions.transferPeerId),
      )
    )
    .orderBy(transactions.bookingDate)

  const stats = computeStatsFromTransactions(txs)

  let subscriptionId: string

  if (existing) {
    // Was dismissed — re-confirm it
    const [updated] = await db
      .update(subscriptions)
      .set({
        status: "confirmed",
        name: body.name ?? existing.name,
        ...stats,
      })
      .where(eq(subscriptions.id, existing.id))
      .returning()
    subscriptionId = updated.id
  } else {
    const [inserted] = await db
      .insert(subscriptions)
      .values({
        accountId: body.accountId,
        counterpartyIban,
        name: body.name ?? null,
        status: "confirmed",
        ...stats,
      })
      .returning()
    subscriptionId = inserted.id
  }

  // Link all unlinked matching transactions
  const unlinkedIds = txs.filter((t) => t.subscriptionId === null).map((t) => t.id)
  if (unlinkedIds.length > 0) {
    await db
      .update(transactions)
      .set({ subscriptionId })
      .where(inArray(transactions.id, unlinkedIds))
  }

  const [result] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId))
  return c.json(result, existing ? 200 : 201)
})

// PATCH /api/subscriptions/:id — update name / isActive / status
app.patch("/:id", validateJson(updateSubscriptionSchema), async (c) => {
  const user = c.get("user")
  const access = toAccessContext(user)
  const id = c.req.param("id")

  const sub = await db.query.subscriptions.findFirst({ where: (s, { eq }) => eq(s.id, id) })
  if (!sub || !(await canEditAccount(access, sub.accountId))) return c.json({ error: "Not found" }, 404)

  const body = c.req.valid("json")

  const updates: Partial<typeof subscriptions.$inferInsert> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.isActive !== undefined) updates.isActive = body.isActive
  if (body.status !== undefined) updates.status = body.status

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400)
  }

  // Dismissing: unlink all transactions so they're no longer attributed to this subscription
  if (body.status === "dismissed") {
    await db
      .update(transactions)
      .set({ subscriptionId: null })
      .where(eq(transactions.subscriptionId, id))
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
  const access = toAccessContext(user)
  const id = c.req.param("id")

  const sub = await db.query.subscriptions.findFirst({ where: (s, { eq }) => eq(s.id, id) })
  if (!sub || !(await canEditAccount(access, sub.accountId))) return c.json({ error: "Not found" }, 404)

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
  const access = toAccessContext(user)
  const id = c.req.param("id")

  const sub = await db.query.subscriptions.findFirst({ where: (s, { eq }) => eq(s.id, id) })
  if (!sub || !(await canViewAccount(access, sub.accountId))) return c.json({ error: "Not found" }, 404)

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
