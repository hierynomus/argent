import { Hono } from "hono"
import { db } from "../db"
import { transactions } from "../db/schema"
import { and, eq, gte, ilike, inArray, isNull, lte, sql } from "drizzle-orm"
import type { LinkTransferBody, TransactionFilters, UpdateTransactionBody } from "@argent/shared"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { updateTransactionSchema, linkTransferSchema } from "@argent/shared"
import { getViewableAccountIds, toAccessContext, canEditAccount } from "../services/accessControl"

const app = new Hono<{ Variables: { user: AuthUser } }>()

const withDetails = { account: true, category: true, transferPeer: { with: { account: true } } } as const

app.get("/", async (c) => {
  const user = c.get("user")
  const accessibleIds = await getViewableAccountIds(toAccessContext(user))
  if (accessibleIds.length === 0) {
    return c.json({ data: [], total: 0, page: 1, pageSize: 50 })
  }

  const query = c.req.query() as TransactionFilters

  const page = Number(query.page ?? 1)
  const pageSize = Math.min(Number(query.pageSize ?? 50), 200)
  const offset = (page - 1) * pageSize

  const conditions = [inArray(transactions.accountId, accessibleIds)]

  const accountIdsParam = c.req.query("accountIds")
  if (accountIdsParam) {
    const requested = accountIdsParam.split(",").filter(Boolean)
    // Intersect requested with accessible
    const allowed = requested.filter((id) => accessibleIds.includes(id))
    if (allowed.length > 0) {
      conditions.push(inArray(transactions.accountId, allowed))
    }
  } else if (query.accountId) {
    if (accessibleIds.includes(query.accountId)) {
      conditions.push(eq(transactions.accountId, query.accountId))
    } else {
      return c.json({ data: [], total: 0, page, pageSize })
    }
  }
  if (query.categoryId === "uncategorized") {
    conditions.push(isNull(transactions.categoryId))
  } else if (query.categoryId) {
    conditions.push(eq(transactions.categoryId, query.categoryId))
  }
  if (query.from) {
    conditions.push(gte(transactions.bookingDate, query.from))
  }
  if (query.to) {
    conditions.push(lte(transactions.bookingDate, query.to))
  }
  if (query.search) {
    conditions.push(ilike(transactions.description, `%${query.search}%`))
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
