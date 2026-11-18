import { and, eq, inArray, or, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { db } from "../db"
import { accounts, accountMembers, portfolios, portfolioMembers, mortgages, mortgageMembers, loans, loanMembers, properties, propertyMembers } from "../db/schema"

export interface AccessContext {
  groups: string[]
  sub: string
  isAdmin: boolean
}

/** Anything carrying the identity fields we need (e.g. the `AuthUser` set by the auth middleware). */
interface AccessSubject {
  sub: string
  groups?: string[]
  isAdmin: boolean
}

/** Builds the access context for an authenticated user. */
export function toAccessContext(user: AccessSubject): AccessContext {
  return { groups: user.groups ?? [], sub: user.sub, isAdmin: user.isAdmin }
}

/**
 * Describes a resource that is owned by one user and can be shared with groups
 * through a `*_members(resourceId, groupName, role)` table.
 */
interface SharedResource {
  table: PgTable
  id: PgColumn
  ownerSub: PgColumn
  members: PgTable
  memberResourceId: PgColumn
  memberGroup: PgColumn
  memberRole: PgColumn
  /** Extra restriction on the resource rows (e.g. portfolio type). */
  scope?: SQL
}

type Mode = "view" | "edit"

const accountResource: SharedResource = {
  table: accounts,
  id: accounts.id,
  ownerSub: accounts.ownerSub,
  members: accountMembers,
  memberResourceId: accountMembers.accountId,
  memberGroup: accountMembers.groupName,
  memberRole: accountMembers.role,
}

const portfolioResource = (type: string): SharedResource => ({
  table: portfolios,
  id: portfolios.id,
  ownerSub: portfolios.ownerSub,
  members: portfolioMembers,
  memberResourceId: portfolioMembers.portfolioId,
  memberGroup: portfolioMembers.groupName,
  memberRole: portfolioMembers.role,
  scope: eq(portfolios.type, type),
})

const mortgageResource: SharedResource = {
  table: mortgages,
  id: mortgages.id,
  ownerSub: mortgages.ownerSub,
  members: mortgageMembers,
  memberResourceId: mortgageMembers.mortgageId,
  memberGroup: mortgageMembers.groupName,
  memberRole: mortgageMembers.role,
}

const loanResource: SharedResource = {
  table: loans,
  id: loans.id,
  ownerSub: loans.ownerSub,
  members: loanMembers,
  memberResourceId: loanMembers.loanId,
  memberGroup: loanMembers.groupName,
  memberRole: loanMembers.role,
}

const propertyResource: SharedResource = {
  table: properties,
  id: properties.id,
  ownerSub: properties.ownerSub,
  members: propertyMembers,
  memberResourceId: propertyMembers.propertyId,
  memberGroup: propertyMembers.groupName,
  memberRole: propertyMembers.role,
}

/**
 * WHERE clause selecting the resources `ctx` may access in the given mode:
 *   - admins: everything (within scope)
 *   - otherwise: resources they own, or that are shared with one of their
 *     groups (any role for "view", `editor` role for "edit").
 */
function accessFilter(r: SharedResource, ctx: AccessContext, mode: Mode): SQL | undefined {
  if (ctx.isAdmin) return r.scope

  const grants: SQL[] = [eq(r.ownerSub, ctx.sub)]
  if (ctx.groups.length > 0) {
    const memberFilter = and(
      inArray(r.memberGroup, ctx.groups),
      mode === "edit" ? eq(r.memberRole, "editor") : undefined,
    )
    grants.push(
      inArray(r.id, db.select({ id: r.memberResourceId }).from(r.members).where(memberFilter)),
    )
  }
  return and(r.scope, or(...grants))
}

async function resolveIds(r: SharedResource, ctx: AccessContext, mode: Mode): Promise<string[]> {
  const rows = await db.select({ id: r.id }).from(r.table).where(accessFilter(r, ctx, mode))
  return rows.map((row) => row.id as string)
}

async function hasAccess(r: SharedResource, ctx: AccessContext, mode: Mode, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: r.id })
    .from(r.table)
    .where(and(eq(r.id, id), accessFilter(r, ctx, mode)))
    .limit(1)
  return rows.length > 0
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** Account IDs the user can read (owner, any-role member via one of their groups, or admin). */
export const getViewableAccountIds = (ctx: AccessContext) => resolveIds(accountResource, ctx, "view")
/** Account IDs the user can write to (owner, editor role via one of their groups, or admin). */
export const getEditableAccountIds = (ctx: AccessContext) => resolveIds(accountResource, ctx, "edit")
export const canViewAccount = (ctx: AccessContext, id: string) => hasAccess(accountResource, ctx, "view", id)
export const canEditAccount = (ctx: AccessContext, id: string) => hasAccess(accountResource, ctx, "edit", id)

// ── Portfolios (crypto | metals | stocks) ────────────────────────────────────

/** Portfolio IDs of the given type the user can read. */
export const getViewablePortfolioIds = (ctx: AccessContext, type: string) => resolveIds(portfolioResource(type), ctx, "view")
/** Portfolio IDs of the given type the user can write to. */
export const getEditablePortfolioIds = (ctx: AccessContext, type: string) => resolveIds(portfolioResource(type), ctx, "edit")
export const canViewPortfolio = (ctx: AccessContext, type: string, id: string) => hasAccess(portfolioResource(type), ctx, "view", id)
export const canEditPortfolio = (ctx: AccessContext, type: string, id: string) => hasAccess(portfolioResource(type), ctx, "edit", id)

// ── Mortgages ────────────────────────────────────────────────────────────────

export const getViewableMortgageIds = (ctx: AccessContext) => resolveIds(mortgageResource, ctx, "view")
export const getEditableMortgageIds = (ctx: AccessContext) => resolveIds(mortgageResource, ctx, "edit")
export const canViewMortgage = (ctx: AccessContext, id: string) => hasAccess(mortgageResource, ctx, "view", id)
export const canEditMortgage = (ctx: AccessContext, id: string) => hasAccess(mortgageResource, ctx, "edit", id)

// ── Loans ────────────────────────────────────────────────────────────────────

export const getViewableLoanIds = (ctx: AccessContext) => resolveIds(loanResource, ctx, "view")
export const getEditableLoanIds = (ctx: AccessContext) => resolveIds(loanResource, ctx, "edit")
export const canViewLoan = (ctx: AccessContext, id: string) => hasAccess(loanResource, ctx, "view", id)
export const canEditLoan = (ctx: AccessContext, id: string) => hasAccess(loanResource, ctx, "edit", id)

// ── Property ─────────────────────────────────────────────────────────────────

export const getViewablePropertyIds = (ctx: AccessContext) => resolveIds(propertyResource, ctx, "view")
export const getEditablePropertyIds = (ctx: AccessContext) => resolveIds(propertyResource, ctx, "edit")
export const canViewProperty = (ctx: AccessContext, id: string) => hasAccess(propertyResource, ctx, "view", id)
export const canEditProperty = (ctx: AccessContext, id: string) => hasAccess(propertyResource, ctx, "edit", id)
