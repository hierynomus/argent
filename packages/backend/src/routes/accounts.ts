import { Hono } from "hono"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"
import { getViewableAccountIds, toAccessContext, canEditAccount, canViewAccount } from "../services/accessControl"
import type { AuthUser } from "../middleware/auth"
import { validateJson } from "../middleware/validate"
import { updateAccountSchema } from "@argent/shared"

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
    const balance = (parseFloat(acc.openingBalance ?? "0") + parseFloat(row?.txSum ?? "0")).toFixed(2)
    return { ...acc, balance }
  }))

  return c.json(accountsWithBalance)
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
  if (body.type === "savings" || body.type === "checking") updates.type = body.type
  if (body.openingBalance !== undefined) updates.openingBalance = body.openingBalance
  if ("openingBalanceDate" in body) updates.openingBalanceDate = body.openingBalanceDate ?? null

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
