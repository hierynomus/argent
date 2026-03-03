import { Hono } from "hono"
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

const app = new Hono<{ Variables: { user: AuthUser } }>()

// GET /api/admin/accounts — all accounts with their member list and resolved owner profile
app.get("/accounts", async (c) => {
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

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
app.patch("/accounts/:id", async (c) => {
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

  const { ownerSub } = await c.req.json<{ ownerSub: string | null }>()

  const [updated] = await db
    .update(accounts)
    .set({ ownerSub: ownerSub ?? null })
    .where(eq(accounts.id, c.req.param("id")))
    .returning()

  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(updated)
})

// POST /api/admin/accounts/:id/members — grant a group access to an account
app.post("/accounts/:id/members", async (c) => {
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

  const accountId = c.req.param("id")
  const { groupName, role } = await c.req.json<{ groupName: string; role?: string }>()

  if (!groupName) return c.json({ error: "groupName is required" }, 400)
  const memberRole = role === "editor" ? "editor" : "viewer"

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
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

  const accountId = c.req.param("id")
  const groupName = c.req.param("groupName")

  await db
    .delete(accountMembers)
    .where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.groupName, groupName)))

  return c.body(null, 204)
})

// GET /api/admin/sharing — consolidated read-only view of all sharing (portfolios, mortgages, loans)
app.get("/sharing", async (c) => {
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

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
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

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

// POST /api/admin/restore — wipe all data and restore from a backup JSON
app.post("/restore", async (c) => {
  if (!c.get("user").isAdmin) return c.json({ error: "Forbidden" }, 403)

  const body = await c.req.json()
  if (body?.version !== 1) return c.json({ error: "Unsupported backup version" }, 400)

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
    mortgages: (typeof mortgages.$inferSelect)[]
    mortgageParts: (typeof mortgageParts.$inferSelect)[]
    mortgageExtraPayments: (typeof mortgageExtraPayments.$inferSelect)[]
    mortgageMembers: (typeof mortgageMembers.$inferSelect)[]
    loans: (typeof loans.$inferSelect)[]
    loanParts: (typeof loanParts.$inferSelect)[]
    loanExtraPayments: (typeof loanExtraPayments.$inferSelect)[]
    loanMembers: (typeof loanMembers.$inferSelect)[]
  }
  const data = body as Backup

  await db.transaction(async (tx) => {
    // Delete in reverse FK dependency order
    await tx.delete(transactions)
    await tx.delete(subscriptions)
    await tx.delete(accountMembers)
    await tx.delete(metalSales)              // FK → metalLots
    await tx.delete(metalLots)               // FK → portfolios
    await tx.delete(cryptoTrades)            // FK → portfolios
    await tx.delete(cryptoAssets)            // FK → portfolios
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
    if (data.accounts?.length) await tx.insert(accounts).values(data.accounts)

    // Categories have a self-reference (parentId); insert roots first
    const rootCats = (data.categories ?? []).filter((cat) => !cat.parentId)
    const childCats = (data.categories ?? []).filter((cat) => cat.parentId)
    if (rootCats.length) await tx.insert(categories).values(rootCats)
    if (childCats.length) await tx.insert(categories).values(childCats)

    if (data.userProfiles?.length) await tx.insert(userProfiles).values(data.userProfiles)
    if (data.portfolios?.length) await tx.insert(portfolios).values(data.portfolios)
    if (data.subscriptions?.length) await tx.insert(subscriptions).values(data.subscriptions)
    if (data.accountMembers?.length) await tx.insert(accountMembers).values(data.accountMembers)
    if (data.portfolioMembers?.length) await tx.insert(portfolioMembers).values(data.portfolioMembers)
    if (data.cryptoTrades?.length) await tx.insert(cryptoTrades).values(data.cryptoTrades)
    if (data.cryptoAssets?.length) await tx.insert(cryptoAssets).values(data.cryptoAssets)
    if (data.metalLots?.length) await tx.insert(metalLots).values(data.metalLots)
    if (data.metalSales?.length) await tx.insert(metalSales).values(data.metalSales)
    if (data.mortgages?.length) await tx.insert(mortgages).values(data.mortgages)
    if (data.mortgageParts?.length) await tx.insert(mortgageParts).values(data.mortgageParts)
    if (data.mortgageExtraPayments?.length) await tx.insert(mortgageExtraPayments).values(data.mortgageExtraPayments)
    if (data.mortgageMembers?.length) await tx.insert(mortgageMembers).values(data.mortgageMembers)
    if (data.loans?.length) await tx.insert(loans).values(data.loans)
    if (data.loanParts?.length) await tx.insert(loanParts).values(data.loanParts)
    if (data.loanExtraPayments?.length) await tx.insert(loanExtraPayments).values(data.loanExtraPayments)
    if (data.loanMembers?.length) await tx.insert(loanMembers).values(data.loanMembers)

    // Transactions have a self-reference (transferPeerId); insert without it first, then patch
    if (data.transactions?.length) {
      await tx.insert(transactions).values(
        data.transactions.map((t) => ({ ...t, transferPeerId: null, subscriptionId: null }))
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
      mortgages: data.mortgages?.length ?? 0,
      loans: data.loans?.length ?? 0,
    },
  })
})

export default app
