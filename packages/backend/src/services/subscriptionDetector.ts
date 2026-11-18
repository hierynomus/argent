import { and, eq, inArray, isNull, isNotNull, sql, count } from "drizzle-orm"
import { db } from "../db"
import { accounts, subscriptions, transactions } from "../db/schema"
import { addDays, daysBetween, todayIso } from "../lib/dates"

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export function computeIntervalLabel(medianDays: number): string {
  if (medianDays >= 6 && medianDays <= 8) return "weekly"
  if (medianDays >= 13 && medianDays <= 17) return "bi-weekly"
  if (medianDays >= 25 && medianDays <= 38) return "monthly"
  if (medianDays >= 85 && medianDays <= 100) return "quarterly"
  if (medianDays >= 350 && medianDays <= 380) return "yearly"
  return "custom"
}

// date arithmetic lives in lib/dates.ts (time-zone independent); re-exported for the detector's callers and tests
export { addDays, daysBetween }

/**
 * Computes subscription stats (medianAmount, intervalDays, etc.) from a sorted
 * list of transactions. Does NOT enforce regularity — that's the detector's job.
 * Used by both the auto-detector and manual subscription creation.
 */
export function computeStatsFromTransactions(txs: Array<{
  bookingDate: string
  amount: string
  currency: string
  counterpartyName: string | null
}>) {
  const amounts = txs.map((t) => parseFloat(t.amount))
  const medianAmt = amounts.length > 0 ? median(amounts) : 0

  const gaps: number[] = []
  for (let i = 1; i < txs.length; i++) {
    gaps.push(daysBetween(txs[i - 1].bookingDate, txs[i].bookingDate))
  }
  const medianGap = gaps.length > 0 ? median(gaps) : null
  const intervalDays = medianGap != null ? Math.round(medianGap) : null
  const intervalLabel = intervalDays != null ? computeIntervalLabel(intervalDays) : null

  const lastTx = txs[txs.length - 1]
  const lastSeenDate = lastTx?.bookingDate ?? null
  const nextExpectedDate =
    lastSeenDate && intervalDays ? addDays(lastSeenDate, intervalDays) : null

  const daysSinceLast = lastSeenDate
    ? daysBetween(lastSeenDate, todayIso())
    : Infinity
  const isActive = intervalDays != null ? daysSinceLast <= intervalDays * 2 : true

  const currency = lastTx?.currency ?? "EUR"
  const counterpartyName = txs.find((t) => t.counterpartyName)?.counterpartyName ?? null

  return {
    medianAmount: medianAmt.toFixed(2),
    intervalDays,
    intervalLabel,
    lastSeenDate,
    nextExpectedDate,
    isActive,
    currency,
    counterpartyName,
  }
}

/**
 * Internal transfers are not subscriptions. A pattern can be detected before the receiving
 * account is imported (so the payments look external), and only later be recognised as
 * transfers by the transfer linker. Clean up after that:
 *   - transactions that became transfers are unlinked from any subscription
 *   - 'candidate' subscriptions (system suggestions, never confirmed by the user) left
 *     without any transaction are removed; confirmed ones are kept.
 */
async function dropTransferSubscriptions(): Promise<void> {
  await db
    .update(transactions)
    .set({ subscriptionId: null })
    .where(and(isNotNull(transactions.subscriptionId), isNotNull(transactions.transferPeerId)))

  await db.delete(subscriptions).where(
    and(
      eq(subscriptions.status, "candidate"),
      sql`NOT EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.subscriptionId} = ${subscriptions.id})`,
    ),
  )
}

/**
 * Detects recurring payment patterns (subscriptions) from DBIT transactions.
 *
 * Groups unlinked DBIT transactions by (accountId, counterpartyIban), checks
 * for regularity, and upserts subscription rows. Returns the count of newly
 * created subscriptions.
 *
 * Behaviour:
 * - Skips (accountId, counterpartyIban) pairs that are already 'dismissed'.
 * - Updates stats on existing 'candidate' or 'confirmed' subscriptions without
 *   touching their status.
 * - Creates new subscriptions as 'candidate' so the user can review them.
 */
export async function detectSubscriptions(): Promise<number> {
  await dropTransferSubscriptions()

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

    // Check for an existing subscription record for this pair
    const [existing] = await db
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.accountId, accountId),
          eq(subscriptions.counterpartyIban, counterpartyIban),
        )
      )
      .limit(1)

    // Skip dismissed pairs — user explicitly doesn't want this as a subscription
    if (existing?.status === "dismissed") continue

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
    const daysSinceLast = daysBetween(lastSeenDate, todayIso())
    const isActive = daysSinceLast <= intervalDays * 2

    let subscriptionId: string

    if (existing) {
      subscriptionId = existing.id
      // Update stats but preserve the existing status (candidate or confirmed)
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
      // New pattern — create as 'candidate' for user review
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
          status: "candidate",
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
