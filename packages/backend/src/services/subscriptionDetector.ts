import { and, eq, inArray, isNull, isNotNull, sql, count } from "drizzle-orm"
import { db } from "../db"
import { accounts, subscriptions, transactions } from "../db/schema"

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function computeIntervalLabel(medianDays: number): string {
  if (medianDays >= 6 && medianDays <= 8) return "weekly"
  if (medianDays >= 13 && medianDays <= 17) return "bi-weekly"
  if (medianDays >= 25 && medianDays <= 38) return "monthly"
  if (medianDays >= 85 && medianDays <= 100) return "quarterly"
  if (medianDays >= 350 && medianDays <= 380) return "yearly"
  return "custom"
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

/**
 * Detects recurring payment patterns (subscriptions) from DBIT transactions.
 *
 * Groups unlinked DBIT transactions by (accountId, counterpartyIban), checks
 * for regularity, and upserts subscription rows. Returns the count of newly
 * created subscriptions.
 */
export async function detectSubscriptions(): Promise<number> {
  const ownAccounts = await db.select({ id: accounts.id }).from(accounts)
  if (ownAccounts.length === 0) return 0

  const ownIds = ownAccounts.map((a) => a.id)

  // Find distinct (accountId, counterpartyIban) groups with ≥2 unlinked DBIT
  // transactions that aren't internal transfers
  const groups = await db
    .select({
      accountId: transactions.accountId,
      counterpartyIban: transactions.counterpartyIban,
      txCount: count(transactions.id),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.creditDebitIndicator, "DBIT"),
        isNull(transactions.transferPeerId),
        isNotNull(transactions.counterpartyIban),
        inArray(transactions.accountId, ownIds),
      )
    )
    .groupBy(transactions.accountId, transactions.counterpartyIban)
    .having(sql`count(${transactions.id}) >= 2`)

  let created = 0

  for (const group of groups) {
    const accountId = group.accountId
    const counterpartyIban = group.counterpartyIban!

    // Load all matching transactions sorted by bookingDate
    const txs = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.creditDebitIndicator, "DBIT"),
          eq(transactions.counterpartyIban, counterpartyIban),
          isNull(transactions.transferPeerId),
        )
      )
      .orderBy(transactions.bookingDate)

    if (txs.length < 2) continue

    // Filter to ±5% of median amount
    const amounts = txs.map((t) => parseFloat(t.amount))
    const medianAmt = median(amounts)
    const amountFiltered = txs.filter((t) => {
      const amt = parseFloat(t.amount)
      return Math.abs(amt - medianAmt) / medianAmt <= 0.05
    })

    if (amountFiltered.length < 2) continue

    // Compute gaps between consecutive transactions
    const gaps: number[] = []
    for (let i = 1; i < amountFiltered.length; i++) {
      gaps.push(daysBetween(amountFiltered[i - 1].bookingDate, amountFiltered[i].bookingDate))
    }

    const medianGap = median(gaps)
    if (medianGap <= 0) continue

    // Check regularity: all gaps within ±20% of median (floor: ±5 days)
    const tolerance = Math.max(medianGap * 0.2, 5)
    const isRegular = gaps.every((g) => Math.abs(g - medianGap) <= tolerance)

    if (!isRegular) continue

    // Compute derived fields
    const medianAmountFinal = median(amountFiltered.map((t) => parseFloat(t.amount)))
    const lastTx = amountFiltered[amountFiltered.length - 1]
    const lastSeenDate = lastTx.bookingDate
    const nextExpectedDate = addDays(lastSeenDate, Math.round(medianGap))
    const intervalDays = Math.round(medianGap)
    const intervalLabel = computeIntervalLabel(intervalDays)
    const currency = lastTx.currency
    const counterpartyName = lastTx.counterpartyName ?? amountFiltered[0].counterpartyName

    // Active if last transaction is within 2× interval
    const daysSinceLast = daysBetween(lastSeenDate, new Date().toISOString().slice(0, 10))
    const isActive = daysSinceLast <= intervalDays * 2

    // Upsert subscription keyed on (accountId, counterpartyIban)
    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.accountId, accountId),
          eq(subscriptions.counterpartyIban, counterpartyIban),
        )
      )
      .limit(1)

    let subscriptionId: string

    if (existing) {
      subscriptionId = existing.id
      await db
        .update(subscriptions)
        .set({
          medianAmount: medianAmountFinal.toFixed(2),
          currency,
          counterpartyName,
          intervalDays,
          intervalLabel,
          nextExpectedDate,
          lastSeenDate,
          isActive,
        })
        .where(eq(subscriptions.id, subscriptionId))
    } else {
      const [inserted] = await db
        .insert(subscriptions)
        .values({
          accountId,
          counterpartyIban,
          counterpartyName,
          medianAmount: medianAmountFinal.toFixed(2),
          currency,
          intervalDays,
          intervalLabel,
          nextExpectedDate,
          lastSeenDate,
          isActive,
        })
        .returning({ id: subscriptions.id })
      subscriptionId = inserted.id
      created++
    }

    // Link any unlinked transactions in the filtered set
    const unlinkedIds = amountFiltered
      .filter((t) => t.subscriptionId === null)
      .map((t) => t.id)

    if (unlinkedIds.length > 0) {
      await db
        .update(transactions)
        .set({ subscriptionId })
        .where(inArray(transactions.id, unlinkedIds))
    }
  }

  return created
}
