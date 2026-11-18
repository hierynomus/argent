import { Hono } from "hono"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import {
  accounts,
  accountMembers,
  categories,
  transactions,
  subscriptions,
  userProfiles,
  portfolios,
  portfolioMembers,
  cryptoTrades,
  cryptoAssets,
  metalLots,
  metalSales,
  stockTrades,
  stockAssets,
  stockDividends,
  mortgages,
  mortgageParts,
  mortgageExtraPayments,
  mortgageMembers,
  loans,
  loanParts,
  loanExtraPayments,
  loanMembers,
} from "../db/schema"
import type { AuthUser } from "../middleware/auth"
import { requireAdmin } from "../middleware/guards"
import { validateJson } from "../middleware/validate"
import { setAccountOwnerSchema, addMemberSchema } from "@argent/shared"

const app = new Hono<{ Variables: { user: AuthUser } }>()

// everything here is admin-only
app.use("*", requireAdmin)

// GET /api/admin/accounts — all accounts with their member list and resolved owner profile
app.get("/accounts", async (c) => {
  const allAccounts = await db.select().from(accounts).orderBy(accounts.iban)

  const result = await Promise.all(
    allAccounts.map(async (acc) => {
      const [members, ownerProfile] = await Promise.all([
        db
          .select({ groupName: accountMembers.groupName, role: accountMembers.role })
          .from(accountMembers)
          .where(eq(accountMembers.accountId, acc.id)),
        acc.ownerSub
          ? db.query.userProfiles.findFirst({
              where: (p, { eq }) => eq(p.sub, acc.ownerSub!),
              columns: { email: true, name: true },
            })
          : Promise.resolve(null),
      ])

      return { ...acc, members, ownerProfile: ownerProfile ?? null }
    }),
  )

  return c.json(result)
})

// PATCH /api/admin/accounts/:id — update ownerSub (ownership transfer)
app.patch("/accounts/:id", validateJson(setAccountOwnerSchema), async (c) => {
  const { ownerSub } = c.req.valid("json")

  const [updated] = await db
    .update(accounts)
    .set({ ownerSub: ownerSub ?? null })
    .where(eq(accounts.id, c.req.param("id")))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// POST /api/admin/accounts/:id/members — grant a group access to an account
app.post("/accounts/:id/members", validateJson(addMemberSchema), async (c) => {
  const accountId = c.req.param("id")
  const { groupName, role } = c.req.valid("json")
  const memberRole = role ?? "viewer"

  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId))
  if (!account) return c.json({ error: "Account not found" }, 404)

  await db
    .insert(accountMembers)
    .values({ accountId, groupName, role: memberRole })
    .onConflictDoUpdate({ target: [accountMembers.accountId, accountMembers.groupName], set: { role: memberRole } })

  return c.json({ accountId, groupName, role: memberRole }, 201)
})

// DELETE /api/admin/accounts/:id/members/:groupName — revoke a group's access
app.delete("/accounts/:id/members/:groupName", async (c) => {
  const accountId = c.req.param("id")
  const groupName = c.req.param("groupName")

  await db
    .delete(accountMembers)
    .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.groupName, groupName)))

  return c.body(null, 204)
})

// GET /api/admin/sharing — consolidated read-only view of all sharing (portfolios, mortgages, loans)
app.get("/sharing", async (c) => {
  const [
    allPortfolios,
    allPortfolioMembers,
    allMortgages,
    allMortgageMembers,
    allLoans,
    allLoanMembers,
  ] = await Promise.all([
    db.select({ id: portfolios.id, name: portfolios.name, type: portfolios.type }).from(portfolios),
    db.select().from(portfolioMembers),
    db.select({ id: mortgages.id, name: mortgages.name }).from(mortgages),
    db.select().from(mortgageMembers),
    db.select({ id: loans.id, name: loans.name }).from(loans),
    db.select().from(loanMembers),
  ])

  const portfolioResult = allPortfolios
    .filter((p) => allPortfolioMembers.some((m) => m.portfolioId === p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      members: allPortfolioMembers
        .filter((m) => m.portfolioId === p.id)
        .map((m) => ({ groupName: m.groupName, role: m.role })),
    }))

  const mortgageResult = allMortgages
    .filter((m) => allMortgageMembers.some((mm) => mm.mortgageId === m.id))
    .map((m) => ({
      id: m.id,
      name: m.name,
      members: allMortgageMembers
        .filter((mm) => mm.mortgageId === m.id)
        .map((mm) => ({ groupName: mm.groupName, role: mm.role })),
    }))

  const loanResult = allLoans
    .filter((l) => allLoanMembers.some((lm) => lm.loanId === l.id))
    .map((l) => ({
      id: l.id,
      name: l.name,
      members: allLoanMembers
        .filter((lm) => lm.loanId === l.id)
        .map((lm) => ({ groupName: lm.groupName, role: lm.role })),
    }))

  return c.json({ portfolios: portfolioResult, mortgages: mortgageResult, loans: loanResult })
})

// GET /api/admin/backup — export all data as a JSON file
app.get("/backup", async (c) => {
  const [
    allAccounts,
    allAccountMembers,
    allCategories,
    allTransactions,
    allSubscriptions,
    allUserProfiles,
    allPortfolios,
    allPortfolioMembers,
    allCryptoTrades,
    allCryptoAssets,
    allMetalLots,
    allMetalSales,
    allStockTrades,
    allStockAssets,
    allStockDividends,
    allMortgages,
    allMortgageParts,
    allMortgageExtraPayments,
    allMortgageMembers,
    allLoans,
    allLoanParts,
    allLoanExtraPayments,
    allLoanMembers,
  ] = await Promise.all([
    db.select().from(accounts),
    db.select().from(accountMembers),
    db.select().from(categories),
    db.select().from(transactions),
    db.select().from(subscriptions),
    db.select().from(userProfiles),
    db.select().from(portfolios),
    db.select().from(portfolioMembers),
    db.select().from(cryptoTrades),
    db.select().from(cryptoAssets),
    db.select().from(metalLots),
    db.select().from(metalSales),
    db.select().from(stockTrades),
    db.select().from(stockAssets),
    db.select().from(stockDividends),
    db.select().from(mortgages),
    db.select().from(mortgageParts),
    db.select().from(mortgageExtraPayments),
    db.select().from(mortgageMembers),
    db.select().from(loans),
    db.select().from(loanParts),
    db.select().from(loanExtraPayments),
    db.select().from(loanMembers),
  ])

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: allAccounts,
    accountMembers: allAccountMembers,
    categories: allCategories,
    transactions: allTransactions,
    subscriptions: allSubscriptions,
    userProfiles: allUserProfiles,
    portfolios: allPortfolios,
    portfolioMembers: allPortfolioMembers,
    cryptoTrades: allCryptoTrades,
    cryptoAssets: allCryptoAssets,
    metalLots: allMetalLots,
    metalSales: allMetalSales,
    stockTrades: allStockTrades,
    stockAssets: allStockAssets,
    stockDividends: allStockDividends,
    mortgages: allMortgages,
    mortgageParts: allMortgageParts,
    mortgageExtraPayments: allMortgageExtraPayments,
    mortgageMembers: allMortgageMembers,
    loans: allLoans,
    loanParts: allLoanParts,
    loanExtraPayments: allLoanExtraPayments,
    loanMembers: allLoanMembers,
  }

  const filename = `argent-backup-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
})

// JSON.parse leaves timestamp columns as ISO strings; Drizzle's timestamp mapper expects Date objects
function withDates<T extends Record<string, unknown>>(rows: T[], fields: (keyof T)[]): T[] {
  return rows.map((row) => {
    const copy = { ...row }
    for (const field of fields) {
      const value = copy[field]
      if (typeof value === "string") copy[field] = new Date(value) as T[typeof field]
    }
    return copy
  })
}

/** Tables included in a backup, as they appear (camelCase) in the backup JSON. */
const BACKUP_TABLES = [
  "accounts", "accountMembers", "categories", "transactions", "subscriptions", "userProfiles",
  "portfolios", "portfolioMembers", "cryptoTrades", "cryptoAssets", "metalLots", "metalSales",
  "stockTrades", "stockAssets", "stockDividends",
  "mortgages", "mortgageParts", "mortgageExtraPayments", "mortgageMembers",
  "loans", "loanParts", "loanExtraPayments", "loanMembers",
] as const

/**
 * Structural check of a backup file: right version, and every table (when present)
 * is an array of objects. Row contents are enforced by the database inside the
 * restore transaction — a bad row rolls the whole restore back.
 */
const restoreSchema = z.looseObject({
  version: z.literal(1, { error: "Unsupported backup version" }),
  ...Object.fromEntries(BACKUP_TABLES.map((t) => [t, z.array(z.looseObject({}), { error: `${t} must be an array` }).optional()])),
})

// POST /api/admin/restore — wipe all data and restore from a backup JSON
app.post("/restore", validateJson(restoreSchema), async (c) => {
  const body = c.req.valid("json")

  type Backup = {
    accounts: (typeof accounts.$inferSelect)[]
    accountMembers: (typeof accountMembers.$inferSelect)[]
    categories: (typeof categories.$inferSelect)[]
    transactions: (typeof transactions.$inferSelect)[]
    subscriptions: (typeof subscriptions.$inferSelect)[]
    userProfiles: (typeof userProfiles.$inferSelect)[]
    portfolios: (typeof portfolios.$inferSelect)[]
    portfolioMembers: (typeof portfolioMembers.$inferSelect)[]
    cryptoTrades: (typeof cryptoTrades.$inferSelect)[]
    cryptoAssets: (typeof cryptoAssets.$inferSelect)[]
    metalLots: (typeof metalLots.$inferSelect)[]
    metalSales: (typeof metalSales.$inferSelect)[]
    stockTrades: (typeof stockTrades.$inferSelect)[]
    stockAssets: (typeof stockAssets.$inferSelect)[]
    stockDividends: (typeof stockDividends.$inferSelect)[]
    mortgages: (typeof mortgages.$inferSelect)[]
    mortgageParts: (typeof mortgageParts.$inferSelect)[]
    mortgageExtraPayments: (typeof mortgageExtraPayments.$inferSelect)[]
    mortgageMembers: (typeof mortgageMembers.$inferSelect)[]
    loans: (typeof loans.$inferSelect)[]
    loanParts: (typeof loanParts.$inferSelect)[]
    loanExtraPayments: (typeof loanExtraPayments.$inferSelect)[]
    loanMembers: (typeof loanMembers.$inferSelect)[]
  }
  const data = body as unknown as Backup // rows are validated by the database inside the transaction

  await db.transaction(async (tx) => {
    // Delete in reverse FK dependency order
    await tx.delete(transactions)
    await tx.delete(subscriptions)
    await tx.delete(accountMembers)
    await tx.delete(metalSales)              // FK → metalLots
    await tx.delete(metalLots)               // FK → portfolios
    await tx.delete(cryptoTrades)            // FK → portfolios
    await tx.delete(cryptoAssets)            // FK → portfolios
    await tx.delete(stockTrades)             // FK → portfolios
    await tx.delete(stockAssets)             // FK → portfolios
    await tx.delete(stockDividends)          // FK → portfolios
    await tx.delete(portfolioMembers)
    await tx.delete(portfolios)
    await tx.delete(accounts)
    await tx.delete(categories)
    await tx.delete(userProfiles)
    await tx.delete(mortgageExtraPayments)   // FK → mortgageParts
    await tx.delete(mortgageMembers)         // FK → mortgages
    await tx.delete(mortgageParts)           // FK → mortgages
    await tx.delete(mortgages)
    await tx.delete(loanExtraPayments)       // FK → loanParts
    await tx.delete(loanMembers)             // FK → loans
    await tx.delete(loanParts)               // FK → loans
    await tx.delete(loans)

    // Insert in FK dependency order
    if (data.accounts?.length) await tx.insert(accounts).values(withDates(data.accounts, ["createdAt"]))

    // Categories have a self-reference (parentId); insert roots first
    const rootCats = (data.categories ?? []).filter((cat) => !cat.parentId)
    const childCats = (data.categories ?? []).filter((cat) => cat.parentId)
    if (rootCats.length) await tx.insert(categories).values(withDates(rootCats, ["createdAt"]))
    if (childCats.length) await tx.insert(categories).values(withDates(childCats, ["createdAt"]))

    if (data.userProfiles?.length) await tx.insert(userProfiles).values(withDates(data.userProfiles, ["updatedAt"]))
    if (data.portfolios?.length) await tx.insert(portfolios).values(withDates(data.portfolios, ["createdAt"]))
    if (data.subscriptions?.length) await tx.insert(subscriptions).values(withDates(data.subscriptions, ["createdAt"]))
    if (data.accountMembers?.length) await tx.insert(accountMembers).values(data.accountMembers)
    if (data.portfolioMembers?.length) await tx.insert(portfolioMembers).values(data.portfolioMembers)
    if (data.cryptoTrades?.length) await tx.insert(cryptoTrades).values(withDates(data.cryptoTrades, ["createdAt"]))
    if (data.cryptoAssets?.length) await tx.insert(cryptoAssets).values(data.cryptoAssets)
    if (data.metalLots?.length) await tx.insert(metalLots).values(withDates(data.metalLots, ["createdAt"]))
    if (data.metalSales?.length) await tx.insert(metalSales).values(withDates(data.metalSales, ["createdAt"]))
    if (data.stockTrades?.length) await tx.insert(stockTrades).values(withDates(data.stockTrades, ["createdAt"]))
    if (data.stockAssets?.length) await tx.insert(stockAssets).values(data.stockAssets)
    if (data.stockDividends?.length) await tx.insert(stockDividends).values(withDates(data.stockDividends, ["createdAt"]))
    if (data.mortgages?.length) await tx.insert(mortgages).values(withDates(data.mortgages, ["createdAt"]))
    if (data.mortgageParts?.length) await tx.insert(mortgageParts).values(withDates(data.mortgageParts, ["createdAt"]))
    if (data.mortgageExtraPayments?.length) await tx.insert(mortgageExtraPayments).values(withDates(data.mortgageExtraPayments, ["createdAt"]))
    if (data.mortgageMembers?.length) await tx.insert(mortgageMembers).values(data.mortgageMembers)
    if (data.loans?.length) await tx.insert(loans).values(withDates(data.loans, ["createdAt"]))
    if (data.loanParts?.length) await tx.insert(loanParts).values(withDates(data.loanParts, ["createdAt"]))
    if (data.loanExtraPayments?.length) await tx.insert(loanExtraPayments).values(withDates(data.loanExtraPayments, ["createdAt"]))
    if (data.loanMembers?.length) await tx.insert(loanMembers).values(data.loanMembers)

    // Transactions have a self-reference (transferPeerId); insert without it first, then patch
    if (data.transactions?.length) {
      await tx.insert(transactions).values(
        withDates(data.transactions, ["createdAt"]).map((t) => ({ ...t, transferPeerId: null, subscriptionId: null }))
      )
      const needsUpdate = data.transactions.filter((t) => t.transferPeerId || t.subscriptionId)
      for (const t of needsUpdate) {
        await tx
          .update(transactions)
          .set({ transferPeerId: t.transferPeerId, subscriptionId: t.subscriptionId })
          .where(eq(transactions.id, t.id))
      }
    }
  })

  return c.json({
    ok: true,
    restored: {
      accounts: data.accounts?.length ?? 0,
      categories: data.categories?.length ?? 0,
      transactions: data.transactions?.length ?? 0,
      subscriptions: data.subscriptions?.length ?? 0,
      portfolios: data.portfolios?.length ?? 0,
      cryptoTrades: data.cryptoTrades?.length ?? 0,
      cryptoAssets: data.cryptoAssets?.length ?? 0,
      metalLots: data.metalLots?.length ?? 0,
      metalSales: data.metalSales?.length ?? 0,
      stockTrades: data.stockTrades?.length ?? 0,
      stockAssets: data.stockAssets?.length ?? 0,
      stockDividends: data.stockDividends?.length ?? 0,
      mortgages: data.mortgages?.length ?? 0,
      loans: data.loans?.length ?? 0,
    },
  })
})

export default app
