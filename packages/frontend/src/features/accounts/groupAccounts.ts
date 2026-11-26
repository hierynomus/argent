import type { Account } from "@argent/shared"

export type AccountTypeFilter = "all" | Account["type"]

export interface AccountGroup {
  /** the holder's name, or null for accounts nobody is set on */
  holder: string | null
  accounts: Account[]
  /** the sum per currency (EUR and USD are never added together) */
  totals: Array<{ currency: string; total: number }>
}

/** The sum of the balances per currency, in the order the currencies first appear. */
export function totalsByCurrency(accounts: Pick<Account, "currency" | "balance">[]): AccountGroup["totals"] {
  const sums = new Map<string, number>()
  for (const a of accounts) sums.set(a.currency, Math.round(((sums.get(a.currency) ?? 0) + parseFloat(a.balance ?? "0")) * 100) / 100)
  return [...sums].map(([currency, total]) => ({ currency, total }))
}

const byName = (a: Account, b: Account) => (a.name ?? a.iban).localeCompare(b.name ?? b.iban, undefined, { sensitivity: "base" })

/** Every holder in use, alphabetically (for suggestions in a form). */
export const holdersOf = (accounts: Pick<Account, "holder">[]): string[] =>
  [...new Set(accounts.map((a) => a.holder).filter((h): h is string => !!h))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))

/**
 * Accounts as the overview shows them: filtered by a search text (name, IBAN, holder) and a type, hidden ones left
 * out unless asked for, grouped by holder (alphabetically, accounts without a holder last).
 * `hiddenCount` is how many hidden accounts match the other filters, for the "Show hidden (n)" switch.
 */
export function groupAccounts(
  accounts: Account[],
  opts: { query?: string; type?: AccountTypeFilter; showHidden?: boolean } = {},
): { groups: AccountGroup[]; hiddenCount: number } {
  const q = (opts.query ?? "").trim().toLowerCase()
  const matching = accounts.filter((a) => {
    // accounts imported before the type column existed have no type: they are checking accounts
    if (opts.type && opts.type !== "all" && (a.type ?? "checking") !== opts.type) return false
    if (!q) return true
    return [a.name, a.iban, a.holder].some((v) => v?.toLowerCase().includes(q))
  })
  const hiddenCount = matching.filter((a) => a.hidden).length
  const visible = opts.showHidden ? matching : matching.filter((a) => !a.hidden)

  const byHolder = new Map<string | null, Account[]>()
  for (const a of visible) byHolder.set(a.holder ?? null, [...(byHolder.get(a.holder ?? null) ?? []), a])
  const holders = [...byHolder.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { sensitivity: "base" })))
  return {
    hiddenCount,
    groups: holders.map((holder) => {
      const list = byHolder.get(holder)!.sort(byName)
      return { holder, accounts: list, totals: totalsByCurrency(list.filter((a) => !a.hidden)) }
    }),
  }
}
