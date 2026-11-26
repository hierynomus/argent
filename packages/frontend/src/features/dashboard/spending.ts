import type { Category, TransactionWithDetails } from "@argent/shared"

export interface SpendingRow {
  key: string
  name: string
  color: string | null
  amount: number
  /** the same category the month before */
  previous: number
  /** share of this month's spending, 0-100 */
  percent: number
}

const UNCATEGORISED = { key: "none", name: "Uncategorised" }
const cents = (n: number) => Math.round(n * 100)

/** What was spent per category in a list of transactions: EUR payments out, transfers between own accounts left out. */
function totals(transactions: TransactionWithDetails[], byId: Map<string, Category>) {
  const out = new Map<string, { name: string; color: string | null; cents: number }>()
  for (const t of transactions) {
    if (t.creditDebitIndicator !== "DBIT" || t.transferPeerId || t.currency !== "EUR") continue
    const own = t.category
    // subcategories count with their parent, so the list stays short enough to read
    const top = own ? (own.parentId ? byId.get(own.parentId) ?? own : own) : null
    const key = top?.id ?? UNCATEGORISED.key
    const entry = out.get(key) ?? { name: top?.name ?? UNCATEGORISED.name, color: top?.color ?? null, cents: 0 }
    entry.cents += cents(parseFloat(t.amount))
    out.set(key, entry)
  }
  return out
}

/**
 * The biggest spending categories of this month next to last month's, largest first. Beyond `top` rows the rest
 * is one "Other" row. Returns the total as well.
 */
export function spendingByCategory(current: TransactionWithDetails[], previous: TransactionWithDetails[], categories: Category[], top = 6): { rows: SpendingRow[]; total: number; previousTotal: number } {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const now = totals(current, byId)
  const before = totals(previous, byId)
  const total = [...now.values()].reduce((n, e) => n + e.cents, 0)
  const previousTotal = [...before.values()].reduce((n, e) => n + e.cents, 0)
  const all = [...now.entries()]
    .map(([key, e]) => ({ key, name: e.name, color: e.color, cents: e.cents, previous: before.get(key)?.cents ?? 0 }))
    .sort((a, b) => b.cents - a.cents)
  const shown = all.slice(0, top)
  const rest = all.slice(top)
  if (rest.length > 0) shown.push({ key: "other", name: "Other", color: null, cents: rest.reduce((n, r) => n + r.cents, 0), previous: rest.reduce((n, r) => n + r.previous, 0) })
  return {
    rows: shown.map((r) => ({ key: r.key, name: r.name, color: r.color, amount: r.cents / 100, previous: r.previous / 100, percent: total > 0 ? (r.cents / total) * 100 : 0 })),
    total: total / 100,
    previousTotal: previousTotal / 100,
  }
}
