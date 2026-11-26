import { Decimal } from "../services/money"
import { Hono } from "hono"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { accountMembers, accounts, subscriptions, transactions } from "../db/schema"
import { getViewableAccountIds, toAccessContext, canEditAccount, canViewAccount } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { createAccountSchema, updateAccountSchema } from "@argent/shared"
import { isOwnerOrAdmin } from "../middleware/guards"
import { balanceHistory } from "../services/balanceHistory"
import { todayIso } from "../lib/dates"

const app = new Hono<{ Variables: { user: AuthUser } }>()

app.get("/", async (c) => {
  const user = c.get("user")
  const ids = await getViewableAccountIds(toAccessContext(user))
  if (ids.length === 0) return c.json([])
  const rows = await db
    .select()
    .from(accounts)
    .where(inArray(accounts.id, ids))
    .orderBy(accounts.iban)

  // Compute balance per account: openingBalance + sum(transactions since openingBalanceDate)
  const accountsWithBalance = await Promise.all(rows.map(async (acc) => {
    const condition = acc.openingBalanceDate
      ? and(eq(transactions.accountId, acc.id), gte(transactions.bookingDate, acc.openingBalanceDate))
      : eq(transactions.accountId, acc.id)
    const [row] = await db
      .select({
        txSum: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.creditDebitIndicator} = 'CRDT'
                              THEN ${transactions.amount}::numeric
                              ELSE -${transactions.amount}::numeric END), 0)`,
      })
      .from(transactions)
      .where(condition)
    const balance = new Decimal(acc.openingBalance ?? "0").plus(row?.txSum ?? "0").toFixed(2)
    return { ...acc, balance }
  }))

  return c.json(accountsWithBalance)
})

/** Create an account by hand: a bank without an export, or cash. The owner is the caller; sharing works as for any account. */
app.post("/", validateJson(createAccountSchema), async (c) => {
  const user = c.get("user")
  const body = c.req.valid("json")
  const iban = body.iban ? body.iban.replace(/\s+/g, "").toUpperCase() : ""
  if (iban) {
    const taken = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.iban, iban) })
    if (taken) return c.json({ error: "An account with this IBAN already exists" }, 409)
  }
  const [created] = await db
    .insert(accounts)
    .values({
      iban: iban || `manual:${crypto.randomUUID()}`,
      name: body.name,
      currency: body.currency,
      type: body.type,
      source: "manual",
      openingBalance: body.openingBalance ?? "0",
      openingBalanceDate: body.openingBalanceDate ?? null,
      holder: body.holder || null,
      ownerSub: user.sub,
    })
    .returning()
  return c.json({ ...created, balance: new Decimal(created!.openingBalance).toFixed(2) }, 201)
})

/**
 * Delete an account with everything on it (its transactions, subscriptions and sharing), e.g. to import it afresh.
 * Transfers to it from other accounts stay, just unlinked; categories and everything outside banking are untouched.
 */
app.delete("/:id", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const account = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.id, id) })
  if (!account || !(await canViewAccount(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  if (!isOwnerOrAdmin(account, user)) return c.json({ error: "Forbidden" }, 403)
  await db.transaction(async (tx) => {
    const own = tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.accountId, id))
    await tx.update(transactions).set({ transferPeerId: null }).where(inArray(transactions.transferPeerId, own))
    await tx.update(transactions).set({ transferPeerId: null, subscriptionId: null }).where(eq(transactions.accountId, id))
    await tx.delete(subscriptions).where(eq(subscriptions.accountId, id))
    await tx.delete(transactions).where(eq(transactions.accountId, id))
    await tx.delete(accountMembers).where(eq(accountMembers.accountId, id))
    await tx.delete(accounts).where(eq(accounts.id, id))
  })
  return c.body(null, 204)
})

/** The balance over time: end-of-day balances, computed from the transactions on every request. */
app.get("/:id/balance-history", async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  if (!(await canViewAccount(toAccessContext(user), id))) return c.json({ error: "Not found" }, 404)
  const account = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.id, id) })
  if (!account) return c.json({ error: "Not found" }, 404)
  const daily = await db
    .select({
      date: transactions.bookingDate,
      net: sql<string>`SUM(CASE WHEN ${transactions.creditDebitIndicator} = 'CRDT' THEN ${transactions.amount}::numeric ELSE -${transactions.amount}::numeric END)`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .groupBy(transactions.bookingDate)
  const points = balanceHistory(account.openingBalance ?? "0", account.openingBalanceDate, daily.map((d) => ({ date: String(d.date), net: String(d.net) })), todayIso())
  return c.json({ currency: account.currency, points })
})

app.get("/:id", async (c) => {
  const user = c.get("user")
  const access = toAccessContext(user)
  const id = c.req.param("id")
  if (!(await canViewAccount(access, id))) return c.json({ error: "Not found" }, 404)
  const account = await db.query.accounts.findFirst({ where: (a, { eq }) => eq(a.id, id) })
  if (!account) return c.json({ error: "Not found" }, 404)
  return c.json(account)
})

app.patch("/:id", validateJson(updateAccountSchema), async (c) => {
  const user = c.get("user")
  const id = c.req.param("id")
  const access = toAccessContext(user)
  if (!(await canEditAccount(access, id))) return c.json({ error: "Forbidden" }, 403)

  const body = c.req.valid("json")

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim() || null
  if (body.type !== undefined) updates.type = body.type
  if (body.openingBalance !== undefined) updates.openingBalance = body.openingBalance
  if ("openingBalanceDate" in body) updates.openingBalanceDate = body.openingBalanceDate ?? null
  if (body.holder !== undefined) updates.holder = body.holder || null
  if (body.hidden !== undefined) updates.hidden = body.hidden

  if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400)

  const [updated] = await db
    .update(accounts)
    .set(updates)
    .where(eq(accounts.id, id))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

export default app
