import { eq, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import {
  accountMembers, accounts, equityPlanMembers, equityPlans, loanMembers, loans, mortgageMembers, mortgages, portfolioMembers, portfolios,
  propertyMembers, properties,
} from "../db/schema"

/**
 * A resource that is owned by one user and can be shared with groups through a
 * `*_members(resourceId, groupName, role)` table. This is the one place that says which tables those are:
 * access control, the owner routes (delete / members) and the admin sharing overview are all driven by it.
 */
export interface SharedResource {
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

export const accountResource: SharedResource = {
  table: accounts,
  id: accounts.id,
  ownerSub: accounts.ownerSub,
  members: accountMembers,
  memberResourceId: accountMembers.accountId,
  memberGroup: accountMembers.groupName,
  memberRole: accountMembers.role,
}

/** Crypto, metals and stocks portfolios share one table, told apart by `type`. Without a type: all of them. */
export const portfolioResource = (type?: string): SharedResource => ({
  table: portfolios,
  id: portfolios.id,
  ownerSub: portfolios.ownerSub,
  members: portfolioMembers,
  memberResourceId: portfolioMembers.portfolioId,
  memberGroup: portfolioMembers.groupName,
  memberRole: portfolioMembers.role,
  ...(type ? { scope: eq(portfolios.type, type) } : {}),
})

export const mortgageResource: SharedResource = {
  table: mortgages,
  id: mortgages.id,
  ownerSub: mortgages.ownerSub,
  members: mortgageMembers,
  memberResourceId: mortgageMembers.mortgageId,
  memberGroup: mortgageMembers.groupName,
  memberRole: mortgageMembers.role,
}

export const loanResource: SharedResource = {
  table: loans,
  id: loans.id,
  ownerSub: loans.ownerSub,
  members: loanMembers,
  memberResourceId: loanMembers.loanId,
  memberGroup: loanMembers.groupName,
  memberRole: loanMembers.role,
}

export const propertyResource: SharedResource = {
  table: properties,
  id: properties.id,
  ownerSub: properties.ownerSub,
  members: propertyMembers,
  memberResourceId: propertyMembers.propertyId,
  memberGroup: propertyMembers.groupName,
  memberRole: propertyMembers.role,
}

export const equityResource: SharedResource = {
  table: equityPlans,
  id: equityPlans.id,
  ownerSub: equityPlans.ownerSub,
  members: equityPlanMembers,
  memberResourceId: equityPlanMembers.planId,
  memberGroup: equityPlanMembers.groupName,
  memberRole: equityPlanMembers.role,
}

/**
 * What the admin "sharing overview" lists: the response key, the resource, which column is its display name,
 * and optionally a column to show as `type`. Accounts are managed on their own admin screen.
 */
export const SHARING_OVERVIEW: Array<{ key: "portfolios" | "mortgages" | "loans" | "properties" | "equity"; resource: SharedResource; name: PgColumn; type?: PgColumn }> = [
  { key: "portfolios", resource: portfolioResource(), name: portfolios.name, type: portfolios.type },
  { key: "mortgages", resource: mortgageResource, name: mortgages.name },
  { key: "loans", resource: loanResource, name: loans.name },
  { key: "properties", resource: propertyResource, name: properties.name },
  { key: "equity", resource: equityResource, name: equityPlans.name },
]
