import { inArray } from "drizzle-orm"
import type { PropertyLiability } from "@argent/shared"
import { db } from "../db"
import { loanExtraPayments, loanParts, loans, mortgageExtraPayments, mortgageParts, mortgages } from "../db/schema"
import { groupBy } from "../lib/groupBy"
import { computePartState } from "./amortization"

/**
 * What a property is worth on `today` (ISO date): the latest valuation dated today or earlier, flat until
 * the next one. Without such a valuation the purchase price counts (once it has been bought), else unknown.
 * Valuations dated in the future are ignored until their day comes.
 */
export function currentValueOf(
  valuations: Array<{ valuationDate: string; value: string }>,
  purchase: { price: string | null; date: string | null },
  today: string,
): { value: number | null; date: string | null } {
  const latest = valuations
    .filter((v) => v.valuationDate <= today)
    // the latest date wins; on the same date the later-entered (last in the list) one
    .reduce<{ valuationDate: string; value: string } | null>((best, v) => (best === null || v.valuationDate >= best.valuationDate ? v : best), null)
  if (latest) return { value: parseFloat(latest.value), date: latest.valuationDate }
  if (purchase.price !== null && (purchase.date === null || purchase.date <= today)) return { value: parseFloat(purchase.price), date: purchase.date }
  return { value: null, date: null }
}

/** The fields of a mortgage part / loan part that the balance calculation needs. */
interface DebtPart {
  id: string
  debtId: string
  type: string
  principal: string
  annualInterestRate: string
  rateType: string
  startDate: string
  endDate: string
}

/** What is still owed on the given mortgages/loans (summed over their parts), keyed by id. */
export async function getLiabilities(kind: "mortgage" | "loan", ids: string[], asOf: Date = new Date()): Promise<Map<string, PropertyLiability>> {
  const result = new Map<string, PropertyLiability>()
  if (ids.length === 0) return result

  const rows = kind === "mortgage"
    ? await db.select({ id: mortgages.id, name: mortgages.name }).from(mortgages).where(inArray(mortgages.id, ids))
    : await db.select({ id: loans.id, name: loans.name }).from(loans).where(inArray(loans.id, ids))
  const parts: DebtPart[] = kind === "mortgage"
    ? (await db.select().from(mortgageParts).where(inArray(mortgageParts.mortgageId, ids))).map((p) => ({ ...p, debtId: p.mortgageId }))
    : (await db.select().from(loanParts).where(inArray(loanParts.loanId, ids))).map((p) => ({ ...p, debtId: p.loanId }))
  const partIds = parts.map((p) => p.id)
  const payments = partIds.length === 0 ? [] : kind === "mortgage"
    ? await db.select().from(mortgageExtraPayments).where(inArray(mortgageExtraPayments.partId, partIds))
    : await db.select().from(loanExtraPayments).where(inArray(loanExtraPayments.partId, partIds))

  const partsOf = groupBy(parts, (p) => p.debtId)
  const paymentsOf = groupBy(payments, (p) => p.partId)
  for (const row of rows) {
    const states = (partsOf.get(row.id) ?? []).map((p) => computePartState(p, paymentsOf.get(p.id) ?? [], asOf))
    result.set(row.id, {
      kind,
      id: row.id,
      name: row.name,
      balance: states.reduce((s, x) => s + x.currentBalance, 0),
      monthlyPayment: states.reduce((s, x) => s + x.monthlyPayment, 0),
    })
  }
  return result
}
