import type { Category, TransactionSummary } from "@argent/shared"

export interface SpendingRow {
  key: string
  name: string
  color: string | null
  amount: number
  /** the same category in the comparison period (an average when it spans several months) */
  previous: number
  /** share of the spending, 0-100 */
  percent: number
  /** the labels to filter the transactions by to see what is behind this row ("uncategorized" for the unlabeled) */
  categoryIds: string[]
}

const UNCATEGORISED = "none"
const cents = (n: number) => Math.round(n * 100)

/** Expenses per top-level category of one summary, in cents. Subcategories count with their parent. */
function totals(summary: TransactionSummary, byId: Map<string, Category>) {
  const out = new Map<string, { name: string; color: string | null; cents: number; top: Category | null }>()
  for (const r of summary.byCategory) {
    if (r.expenses <= 0) continue
    const own = r.categoryId ? byId.get(r.categoryId) ?? null : null
    const top = own ? (own.parentId ? byId.get(own.parentId) ?? own : own) : null
    const key = top?.id ?? UNCATEGORISED
    const entry = out.get(key) ?? { name: top?.name ?? "Uncategorised", color: top?.color ?? null, cents: 0, top }
    entry.cents += cents(r.expenses)
    out.set(key, entry)
  }
  return out
}

/**
 * The biggest spending categories of a period next to a comparison (last month, or the average of the months
 * before), largest first. Beyond `top` rows the rest is one "Other" row.
 */
export function spendingByCategory(current: TransactionSummary, comparison: TransactionSummary[], categories: Category[], top = 6): { rows: SpendingRow[]; total: number; previousTotal: number } {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const now = totals(current, byId)
  const before = comparison.map((s) => totals(s, byId))
  const average = (n: number) => (before.length === 0 ? 0 : Math.round(n / before.length))
  const previousOf = (key: string) => average(before.reduce((n, m) => n + (m.get(key)?.cents ?? 0), 0))
  const idsOf = (key: string, top: Category | null) => (top ? [top.id, ...categories.filter((c) => c.parentId === top.id).map((c) => c.id)] : key === UNCATEGORISED ? ["uncategorized"] : [])

  const all = [...now.entries()]
    .map(([key, e]) => ({ key, name: e.name, color: e.color, cents: e.cents, previous: previousOf(key), ids: idsOf(key, e.top) }))
    .sort((a, b) => b.cents - a.cents)
  const shown = all.slice(0, top)
  const rest = all.slice(top)
  if (rest.length > 0) shown.push({ key: "other", name: "Other", color: null, cents: rest.reduce((n, r) => n + r.cents, 0), previous: rest.reduce((n, r) => n + r.previous, 0), ids: rest.flatMap((r) => r.ids) })
  const total = cents(current.expenses)
  return {
    rows: shown.map((r) => ({ key: r.key, name: r.name, color: r.color, amount: r.cents / 100, previous: r.previous / 100, percent: total > 0 ? (r.cents / total) * 100 : 0, categoryIds: r.ids })),
    total: total / 100,
    previousTotal: average(comparison.reduce((n, s) => n + cents(s.expenses), 0)) / 100,
  }
}
