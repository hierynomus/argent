import { and, eq, inArray, isNull, ne, isNotNull, sql, TransactionRollbackError } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"

// EndToEndId sentinel used by banks when no reference is provided
const NOTPROVIDED = "NOTPROVIDED"

/**
 * Links two transactions as the two legs of one transfer — both or neither. Only transactions that are
 * still unlinked are touched, so two runs at the same time (or a manual link in between) cannot leave a
 * transaction pointing at a peer that points elsewhere. Returns whether the pair was linked.
 */
export async function linkPair(idA: string, idB: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const link = async (id: string, peerId: string) =>
      (await tx.update(transactions).set({ transferPeerId: peerId }).where(and(eq(transactions.id, id), isNull(transactions.transferPeerId))).returning({ id: transactions.id })).length === 1
    if ((await link(idA, idB)) && (await link(idB, idA))) return true
    tx.rollback() // one leg was taken meanwhile: undo the other
    return false
  }).catch((err) => {
    if (err instanceof TransactionRollbackError) return false // we asked for it above
    throw err
  })
}

/**
 * Automatically links transfer pairs between own accounts using two strategies:
 *
 * 1. EndToEndId match (primary — deterministic)
 *    In SEPA transfers the EndToEndId is carried unchanged from the originating
 *    payment to the beneficiary's statement, so both legs share the same value
 *    in their `reference` field. When two unlinked transactions on different own
 *    accounts have the same reference, opposite directions, same amount and dates
 *    within ±3 days they are definitively the same transfer.
 *
 * 2. CounterpartyIban match (fallback — heuristic)
 *    Used when no shared reference is available (e.g. internal bank transfers
 *    that don't carry an EndToEndId). Requires the DBIT leg's counterpartyIban
 *    to match one of our own IBANs and picks the closest-date CRDT candidate.
 *
 * Returns the number of new pairs linked.
 */
export async function linkTransfers(): Promise<number> {
  const ownAccounts = await db.select({ id: accounts.id, iban: accounts.iban }).from(accounts)
  if (ownAccounts.length < 2) return 0

  const ownIds = ownAccounts.map((a) => a.id)
  const ibanToId = new Map(ownAccounts.map((a) => [a.iban, a.id]))
  const ownIbans = [...ibanToId.keys()]

  let linked = 0
  const linkedIds = new Set<string>() // avoid double-processing within one run

  // ── Strategy 1: EndToEndId ───────────────────────────────────────────────
  // Find unlinked DBIT transactions on own accounts that have a usable reference
  const withRef = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.creditDebitIndicator, "DBIT"),
        isNull(transactions.transferPeerId),
        inArray(transactions.accountId, ownIds),
        isNotNull(transactions.reference),
        ne(transactions.reference, NOTPROVIDED),
      )
    )

  for (const tx of withRef) {
    if (linkedIds.has(tx.id)) continue

    const [peer] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.creditDebitIndicator, "CRDT"),
          eq(transactions.reference, tx.reference!),
          eq(transactions.amount, tx.amount),
          eq(transactions.currency, tx.currency),
          inArray(transactions.accountId, ownIds),
          // A transfer moves money BETWEEN accounts; a payment and its reversal on the
          // same account sharing an EndToEndId are not a transfer.
          ne(transactions.accountId, tx.accountId),
          isNull(transactions.transferPeerId),
          ne(transactions.id, tx.id),
          sql`${transactions.bookingDate}::date BETWEEN (${tx.bookingDate}::date - 3) AND (${tx.bookingDate}::date + 3)`,
        )
      )
      .limit(1)

    if (!peer) continue

    if (!(await linkPair(tx.id, peer.id))) continue // linked by someone else in the meantime
    linkedIds.add(tx.id)
    linkedIds.add(peer.id)
    linked++
  }

  // ── Strategy 2: CounterpartyIban heuristic ───────────────────────────────
  // Handles transfers where the bank doesn't carry a shared EndToEndId
  const withIban = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.creditDebitIndicator, "DBIT"),
        isNull(transactions.transferPeerId),
        inArray(transactions.counterpartyIban, ownIbans),
      )
    )

  for (const tx of withIban) {
    if (linkedIds.has(tx.id)) continue

    const peerAccountId = ibanToId.get(tx.counterpartyIban!)
    if (!peerAccountId || peerAccountId === tx.accountId) continue

    const [peer] = await db.query.transactions.findMany({
      where: and(
        eq(transactions.accountId, peerAccountId),
        eq(transactions.creditDebitIndicator, "CRDT"),
        eq(transactions.amount, tx.amount),
        eq(transactions.currency, tx.currency),
        isNull(transactions.transferPeerId),
        sql`${transactions.id} != ${tx.id}`,
        sql`${transactions.bookingDate}::date BETWEEN (${tx.bookingDate}::date - 3) AND (${tx.bookingDate}::date + 3)`,
      ),
      orderBy: (_t, { asc }) => [
        sql`abs(${transactions.bookingDate}::date - ${tx.bookingDate}::date)`,
        asc(transactions.createdAt),
      ],
      limit: 1,
    })

    if (!peer) continue

    if (!(await linkPair(tx.id, peer.id))) continue // linked by someone else in the meantime
    linkedIds.add(tx.id)
    linkedIds.add(peer.id)
    linked++
  }

  return linked
}
