import { Hono } from "hono"
import { db } from "../db"
import { transactions } from "../db/schema"
import { and, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm"
import type { AuthUser } from "../middleware/auth"
import { validateJson, validateQuery } from "../middleware/validate"
import { updateTransactionSchema, linkTransferSchema, transactionFiltersSchema, transactionSummaryQuerySchema, createTransactionSchema, updateManualTransactionSchema } from "@argent/shared"
import { runBackgroundJobs } from "../services/backgroundJobs"
import { getViewableAccountIds, toAccessContext, canEditAccount } from "../services/accessControl"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const withDetails = { account: true, category: true, transferPeer: { with: { account: true } } } as const

app.get("/", validateQuery(transactionFiltersSchema), async (c) => {
  const user = c.get("user")
  const query = c.req.valid("query")
  const { page, pageSize } = query
  const offset = (page - 1) * pageSize

  const accessibleIds = await getViewableAccountIds(toAccessContext(user))
  if (accessibleIds.length === 0) return c.json({ data: [], total: 0, page, pageSize })

  const conditions = [inArray(transactions.accountId, accessibleIds)]

  // restrict to the requested accounts the user may see; asking only for accounts they may not see gives nothing
  const requested = [...(query.accountId ? [query.accountId] : []), ...(query.accountIds ?? [])]
  if (requested.length > 0) {
    const allowed = requested.filter((id) => accessibleIds.includes(id))
    if (allowed.length === 0) return c.json({ data: [], total: 0, page, pageSize })
    conditions.push(inArray(transactions.accountId, allowed))
  }
  if (query.categoryId === "uncategorized") {
    conditions.push(isNull(transactions.categoryId))
  } else if (query.categoryId) {
    conditions.push(eq(transactions.categoryId, query.categoryId))
  }
  if (query.categoryIds && query.categoryIds.length > 0) {
    const ids = query.categoryIds.filter((id) => id !== "uncategorized")
    const withNone = query.categoryIds.includes("uncategorized")
    const any = [...(ids.length > 0 ? [inArray(transactions.categoryId, ids)] : []), ...(withNone ? [isNull(transactions.categoryId)] : [])]
    conditions.push(any.length === 1 ? any[0]! : or(...any)!)
  }
  if (query.direction) conditions.push(eq(transactions.creditDebitIndicator, query.direction))
  if (query.excludeTransfers) conditions.push(isNull(transactions.transferPeerId))
  if (query.currency) conditions.push(eq(transactions.currency, query.currency))
  if (query.from) conditions.push(gte(transactions.bookingDate, query.from))
  if (query.to) conditions.push(lte(transactions.bookingDate, query.to))
  if (query.search) {
    // % and _ in the text are literal characters, not wildcards
    conditions.push(ilike(transactions.description, `%${query.search.replace(/[\\%_]/g, "\\$&")}%`))
  }

  const where = and(...conditions)

  const [rows, countResult] = await Promise.all([
    db.query.transactions.findMany({
      where,
      with: withDetails,
      orderBy: (t, { desc }) => [desc(t.bookingDate), desc(t.createdAt)],
      limit: pageSize,
      offset,
    }),
    db.select({ count: sql<number>`count(*)` }).from(transactions).where(where),
  ])

  const accessibleSet = new Set(accessibleIds)
  const data = rows.map((tx) => {
    if (tx.transferPeer && !accessibleSet.has(tx.transferPeer.accountId)) {
      return { ...tx, transferPeerId: null, transferPeer: null }
    }
    return tx
  })

  return c.json({
    data,
    total: Number(countResult[0]?.count ?? 0),
    page,
    pageSize,
  })
})

/**
 * Money in and out over a period, EUR, without transfers between own accounts, in total and per label: the
 * dashboard's cash flow and spending. Summed in the database, so a busy month is never cut off by a page size.
 */
app.get("/summary", validateQuery(transactionSummaryQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query")
  const accessibleIds = await getViewableAccountIds(toAccessContext(c.get("user")))
  const empty = { from, to, currency: "EUR", income: 0, expenses: 0, byCategory: [] }
  if (accessibleIds.length === 0) return c.json(empty)
  const amount = sql`${transactions.amount}::numeric`
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      expenses: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.creditDebitIndicator} = 'DBIT' THEN ${amount} ELSE 0 END), 0)`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.creditDebitIndicator} = 'CRDT' THEN ${amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(
      inArray(transactions.accountId, accessibleIds),
      eq(transactions.currency, "EUR"),
      isNull(transactions.transferPeerId),
      gte(transactions.bookingDate, from),
      lte(transactions.bookingDate, to),
    ))
    .groupBy(transactions.categoryId)
  const byCategory = rows
    .map((r) => ({ categoryId: r.categoryId, expenses: Math.round(parseFloat(r.expenses) * 100) / 100, income: Math.round(parseFloat(r.income) * 100) / 100 }))
    .sort((a, b) => b.expenses - a.expenses)
  const cents = (pick: (r: { expenses: number; income: number }) => number) => byCategory.reduce((n, r) => n + Math.round(pick(r) * 100), 0) / 100
  return c.json({ ...empty, income: cents((r) => r.income), expenses: cents((r) => r.expenses), byCategory })
})

/** Enter a transaction by hand (a bank without an export, cash). It links to transfers like any other. */
app.post("/", validateJson(createTransactionSchema), async (c) => {
  const body = c.req.valid("json")
  if (!(await canEditAccount(toAccessContext(c.get("user")), body.accountId))) return c.json({ error: "Not found" }, 404)
  const account = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.id, body.accountId) })
  if (!account) return c.json({ error: "Not found" }, 404)
  const [created] = await db
    .insert(transactions)
    .values({
      accountId: account.id,
      amount: body.amount,
      currency: account.currency,
      creditDebitIndicator: body.direction,
      bookingDate: body.bookingDate,
      description: body.description || null,
      counterpartyName: body.counterpartyName || null,
      counterpartyIban: body.counterpartyIban ? body.counterpartyIban.replace(/\s+/g, "").toUpperCase() : null,
      categoryId: body.categoryId ?? null,
      importHash: `manual:${crypto.randomUUID()}`,
      isManual: true,
    })
    .returning()
  await runBackgroundJobs("manual transaction")
  return c.json(created, 201)
})

/** Edit a transaction entered by hand. Bank records (imports) are not editable, only labelled and linked. */
app.put("/:id", validateJson(updateManualTransactionSchema), async (c) => {
  const id = c.req.param("id")
  const body = c.req.valid("json")
  const tx = await db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!tx || !(await canEditAccount(toAccessContext(c.get("user")), tx.accountId))) return c.json({ error: "Not found" }, 404)
  if (!tx.isManual) return c.json({ error: "Only transactions entered by hand can be edited" }, 409)
  const updates: Partial<typeof transactions.$inferInsert> = {}
  if (body.bookingDate !== undefined) updates.bookingDate = body.bookingDate
  if (body.direction !== undefined) updates.creditDebitIndicator = body.direction
  if (body.amount !== undefined) updates.amount = body.amount
  if (body.description !== undefined) updates.description = body.description || null
  if (body.counterpartyName !== undefined) updates.counterpartyName = body.counterpartyName || null
  if (body.counterpartyIban !== undefined) updates.counterpartyIban = body.counterpartyIban ? body.counterpartyIban.replace(/\s+/g, "").toUpperCase() : null
  if (body.categoryId !== undefined) updates.categoryId = body.categoryId
  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)
  // the other leg of a transfer no longer matches when the amount, direction or date changes
  if (tx.transferPeerId && (updates.amount || updates.creditDebitIndicator || updates.bookingDate)) {
    await db.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, tx.transferPeerId))
    updates.transferPeerId = null
  }
  const [updated] = await db.update(transactions).set(updates).where(eq(transactions.id, id)).returning()
  await runBackgroundJobs("manual transaction")
  return c.json(updated)
})

/** Delete a transaction entered by hand (its transfer partner stays, unlinked). */
app.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const tx = await db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!tx || !(await canEditAccount(toAccessContext(c.get("user")), tx.accountId))) return c.json({ error: "Not found" }, 404)
  if (!tx.isManual) return c.json({ error: "Only transactions entered by hand can be deleted" }, 409)
  if (tx.transferPeerId) await db.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, tx.transferPeerId))
  await db.delete(transactions).where(eq(transactions.id, id))
  return c.body(null, 204)
})

app.get("/:id/transfer-suggestions", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getViewableAccountIds(toAccessContext(user))

  const tx = await db.query.transactions.findFirst({
    where: (t, { eq }) => eq(t.id, c.req.param("id")),
  })
  if (!tx || !accessibleIds.includes(tx.accountId)) return c.json({ error: "Not found" }, 404)

  const opposite = tx.creditDebitIndicator === "CRDT" ? "DBIT" : "CRDT"

  const suggestions = await db.query.transactions.findMany({
    where: and(
      sql`${transactions.id} != ${tx.id}`,
      eq(transactions.amount, tx.amount),
      eq(transactions.creditDebitIndicator, opposite),
      isNull(transactions.transferPeerId),
      inArray(transactions.accountId, accessibleIds),
      sql`${transactions.bookingDate}::date BETWEEN (${tx.bookingDate}::date - 3) AND (${tx.bookingDate}::date + 3)`,
    ),
    with: { account: true },
    orderBy: (_t, { asc }) => [
      sql`abs(${transactions.bookingDate}::date - ${tx.bookingDate}::date)`,
      asc(transactions.createdAt),
    ],
    limit: 10,
  })

  return c.json(suggestions)
})

app.patch("/:id", validateJson(updateTransactionSchema), async (c) => {
  const user = c.get("user")
  const access = toAccessContext(user)
  const body = c.req.valid("json")
  const id = c.req.param("id")

  const tx = await db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!tx || !(await canEditAccount(access, tx.accountId))) return c.json({ error: "Not found" }, 404)

  const [updated] = await db
    .update(transactions)
    .set({ categoryId: body.categoryId })
    .where(eq(transactions.id, id))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

app.post("/:id/transfer", validateJson(linkTransferSchema), async (c) => {
  const user = c.get("user")
  const access = toAccessContext(user)
  const id = c.req.param("id")
  const { peerId } = c.req.valid("json")

  const [txA, txB] = await Promise.all([
    db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, id) }),
    db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, peerId) }),
  ])

  if (!txA || !txB) return c.json({ error: "Not found" }, 404)
  if (!(await canEditAccount(access, txA.accountId)) || !(await canEditAccount(access, txB.accountId))) {
    return c.json({ error: "Forbidden" }, 403)
  }
  if (txA.transferPeerId || txB.transferPeerId) {
    return c.json({ error: "One or both transactions are already linked to a transfer" }, 409)
  }

  await Promise.all([
    db.update(transactions).set({ transferPeerId: peerId }).where(eq(transactions.id, id)),
    db.update(transactions).set({ transferPeerId: id }).where(eq(transactions.id, peerId)),
  ])

  const updated = await db.query.transactions.findFirst({
    where: (t, { eq }) => eq(t.id, id),
    with: withDetails,
  })

  return c.json(updated)
})

app.delete("/:id/transfer", async (c) => {
  const user = c.get("user")
  const access = toAccessContext(user)
  const id = c.req.param("id")

  const tx = await db.query.transactions.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!tx || !(await canEditAccount(access, tx.accountId))) return c.json({ error: "Not found" }, 404)
  if (!tx.transferPeerId) return c.json({ error: "Not linked to a transfer" }, 409)

  await Promise.all([
    db.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, id)),
    db.update(transactions).set({ transferPeerId: null }).where(eq(transactions.id, tx.transferPeerId)),
  ])

  return c.body(null, 204)
})

export default app
