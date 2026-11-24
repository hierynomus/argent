/** Pure helpers for pension plans: which statement counts, what state a plan is in, what it adds to net worth. */

export interface DatedStatement {
  statementDate: string
}

/** The latest statement dated `today` or earlier (the list is oldest first, so a later entry wins a tie); null without one. */
export function latestStatementOf<T extends DatedStatement>(statements: T[], today: string): T | null {
  let latest: T | null = null
  for (const s of statements) if (s.statementDate <= today && (latest === null || s.statementDate >= latest.statementDate)) latest = s
  return latest
}

/** A plan with a `closedOn` of today or earlier is closed; otherwise it is as stored (active or frozen). */
export function planState(plan: { status: string; closedOn: string | null }, today: string): "active" | "frozen" | "closed" {
  if (plan.closedOn && plan.closedOn <= today) return "closed"
  return plan.status === "frozen" ? "frozen" : "active"
}

/** Whether a plan counts in net worth when nothing is said: only a pot you own (DC, personal), not rights or the state pension. */
export const countsByDefault = (kind: string) => kind === "occupational_dc" || kind === "personal"

/** What a plan adds to net worth: its capital when it counts and is not closed, else nothing. */
export function netWorthValueOf(plan: { countInNetWorth: boolean; state: string }, capital: number | null): number {
  return plan.countInNetWorth && plan.state !== "closed" && capital !== null ? capital : 0
}
