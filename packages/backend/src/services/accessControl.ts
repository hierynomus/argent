import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { accounts, accountMembers, portfolios, portfolioMembers, mortgages, mortgageMembers, loans, loanMembers } from "../db/schema"

export interface AccessContext {
  groups: string[]
  sub: string
  isAdmin: boolean
}

/** Account IDs the user can read (owner, viewer or editor role via any of their groups, or admin). */
export async function getViewableAccountIds(ctx: AccessContext): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: accounts.id }).from(accounts)
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ accountId: accountMembers.accountId })
          .from(accountMembers)
          .where(inArray(accountMembers.groupName, ctx.groups))
      : Promise.resolve([]),
    db.select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerSub, ctx.sub)),
  ])

  return [...new Set([...byGroup.map((r) => r.accountId), ...byOwner.map((r) => r.id)])]
}

/** Portfolio IDs of the given type the user can read (owner, any-role member, or admin). */
export async function getViewablePortfolioIds(ctx: AccessContext, type: string): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.type, type))
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ portfolioId: portfolioMembers.portfolioId })
          .from(portfolioMembers)
          .innerJoin(portfolios, eq(portfolios.id, portfolioMembers.portfolioId))
          .where(and(inArray(portfolioMembers.groupName, ctx.groups), eq(portfolios.type, type)))
      : Promise.resolve([]),
    db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.ownerSub, ctx.sub), eq(portfolios.type, type))),
  ])

  return [...new Set([...byGroup.map((r) => r.portfolioId), ...byOwner.map((r) => r.id)])]
}

/** Portfolio IDs of the given type the user can write to (owner, editor role, or admin). */
export async function getEditablePortfolioIds(ctx: AccessContext, type: string): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.type, type))
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ portfolioId: portfolioMembers.portfolioId })
          .from(portfolioMembers)
          .innerJoin(portfolios, eq(portfolios.id, portfolioMembers.portfolioId))
          .where(and(inArray(portfolioMembers.groupName, ctx.groups), eq(portfolioMembers.role, "editor"), eq(portfolios.type, type)))
      : Promise.resolve([]),
    db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.ownerSub, ctx.sub), eq(portfolios.type, type))),
  ])

  return [...new Set([...byGroup.map((r) => r.portfolioId), ...byOwner.map((r) => r.id)])]
}

/** Mortgage IDs the user can read (owner, any-role member, or admin). */
export async function getViewableMortgageIds(ctx: AccessContext): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: mortgages.id }).from(mortgages)
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ mortgageId: mortgageMembers.mortgageId })
          .from(mortgageMembers)
          .where(inArray(mortgageMembers.groupName, ctx.groups))
      : Promise.resolve([]),
    db.select({ id: mortgages.id }).from(mortgages).where(eq(mortgages.ownerSub, ctx.sub)),
  ])

  return [...new Set([...byGroup.map((r) => r.mortgageId), ...byOwner.map((r) => r.id)])]
}

/** Mortgage IDs the user can write to (owner, editor role, or admin). */
export async function getEditableMortgageIds(ctx: AccessContext): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: mortgages.id }).from(mortgages)
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ mortgageId: mortgageMembers.mortgageId })
          .from(mortgageMembers)
          .where(and(inArray(mortgageMembers.groupName, ctx.groups), eq(mortgageMembers.role, "editor")))
      : Promise.resolve([]),
    db.select({ id: mortgages.id }).from(mortgages).where(eq(mortgages.ownerSub, ctx.sub)),
  ])

  return [...new Set([...byGroup.map((r) => r.mortgageId), ...byOwner.map((r) => r.id)])]
}

/** Loan IDs the user can read (owner, any-role member, or admin). */
export async function getViewableLoanIds(ctx: AccessContext): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: loans.id }).from(loans)
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ loanId: loanMembers.loanId })
          .from(loanMembers)
          .where(inArray(loanMembers.groupName, ctx.groups))
      : Promise.resolve([]),
    db.select({ id: loans.id }).from(loans).where(eq(loans.ownerSub, ctx.sub)),
  ])

  return [...new Set([...byGroup.map((r) => r.loanId), ...byOwner.map((r) => r.id)])]
}

/** Loan IDs the user can write to (owner, editor role, or admin). */
export async function getEditableLoanIds(ctx: AccessContext): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: loans.id }).from(loans)
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ loanId: loanMembers.loanId })
          .from(loanMembers)
          .where(and(inArray(loanMembers.groupName, ctx.groups), eq(loanMembers.role, "editor")))
      : Promise.resolve([]),
    db.select({ id: loans.id }).from(loans).where(eq(loans.ownerSub, ctx.sub)),
  ])

  return [...new Set([...byGroup.map((r) => r.loanId), ...byOwner.map((r) => r.id)])]
}

/** Account IDs the user can write to (owner, editor role via any of their groups, or admin). */
export async function getEditableAccountIds(ctx: AccessContext): Promise<string[]> {
  if (ctx.isAdmin) {
    const rows = await db.select({ id: accounts.id }).from(accounts)
    return rows.map((r) => r.id)
  }

  const [byGroup, byOwner] = await Promise.all([
    ctx.groups.length > 0
      ? db
          .select({ accountId: accountMembers.accountId })
          .from(accountMembers)
          .where(and(inArray(accountMembers.groupName, ctx.groups), eq(accountMembers.role, "editor")))
      : Promise.resolve([]),
    db.select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerSub, ctx.sub)),
  ])

  return [...new Set([...byGroup.map((r) => r.accountId), ...byOwner.map((r) => r.id)])]
}
