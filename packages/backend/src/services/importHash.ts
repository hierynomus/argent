import { sql } from "drizzle-orm"
import { eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { accounts, transactions } from "../db/schema"

/**
 * Brings the stored `import_hash` of a bank account's imported transactions in line with `computeImportHash`
 * (same inputs as migration 0019, keep them in sync). Rows can carry an older hash, e.g. from a backup made
 * before the hash changed; the statement would then not be recognised and its entries would be added again.
 *
 * A row is left alone when another row already holds the new hash (an existing duplicate: updating it would
 * break the unique constraint), and of several stale rows that would get the same hash only the oldest is updated.
 * Returns how many hashes were changed.
 */
export async function refreshImportHashes(accountId: string): Promise<number> {
  const result = await db.execute(sql`
    WITH calc AS (
      SELECT t.id, t.created_at, t.import_hash AS current_hash,
        encode(sha256(convert_to(
          concat_ws('|', a.iban, t.credit_debit_indicator, t.amount::text, t.currency, t.booking_date::text,
                    coalesce(t.counterparty_iban, ''), coalesce(t.reference, ''), coalesce(t.description, '')),
          'UTF8')), 'hex') AS new_hash
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id = ${accountId} AND NOT t.is_manual
    ), pick AS (
      SELECT DISTINCT ON (new_hash) id, new_hash FROM calc
      WHERE current_hash <> new_hash
      ORDER BY new_hash, created_at, id
    )
    UPDATE transactions t SET import_hash = p.new_hash
    FROM pick p
    WHERE t.id = p.id AND NOT EXISTS (SELECT 1 FROM transactions o WHERE o.import_hash = p.new_hash)
    RETURNING t.id
  `)
  return (result as { rows?: unknown[] }).rows?.length ?? (Array.isArray(result) ? result.length : 0)
}

/**
 * Removes transactions that are the same bank entry stored more than once (what an older hash let through), then
 * brings every stored hash up to date. "The same" means the current import hash agrees: account, direction, amount,
 * currency, date, counterparty, reference and description. Of each group one row stays: the one that carries the
 * most work (a transfer link, a category, a subscription), else the oldest. It takes over a category the others
 * had; transfer partners of removed copies are unlinked (the linker pairs them again afterwards).
 */
export async function removeDuplicateTransactions(): Promise<{ removed: number; rehashed: number }> {
  const res: any = await db.execute(sql`
    SELECT t.id, t.account_id, t.created_at, t.category_id, t.transfer_peer_id, t.subscription_id,
      encode(sha256(convert_to(
        concat_ws('|', a.iban, t.credit_debit_indicator, t.amount::text, t.currency, t.booking_date::text,
                  coalesce(t.counterparty_iban, ''), coalesce(t.reference, ''), coalesce(t.description, '')),
        'UTF8')), 'hex') AS new_hash
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE NOT t.is_manual
  `)
  type Row = { id: string; account_id: string; created_at: Date | string; category_id: string | null; transfer_peer_id: string | null; subscription_id: string | null; new_hash: string }
  const rows: Row[] = res.rows ?? res
  const groups = new Map<string, Row[]>()
  for (const r of rows) groups.set(r.new_hash, [...(groups.get(r.new_hash) ?? []), r])

  const score = (r: Row) => (r.transfer_peer_id ? 4 : 0) + (r.category_id ? 2 : 0) + (r.subscription_id ? 1 : 0)
  let removed = 0
  await db.transaction(async (tx) => {
    for (const group of groups.values()) {
      if (group.length < 2) continue
      group.sort((a, b) => score(b) - score(a) || +new Date(a.created_at) - +new Date(b.created_at))
      const [keep, ...losers] = group
      const loserIds = losers.map((l) => l.id)
      const category = keep!.category_id ?? losers.find((l) => l.category_id)?.category_id ?? null
      if (category && !keep!.category_id) await tx.update(transactions).set({ categoryId: category }).where(eq(transactions.id, keep!.id))
      await tx.update(transactions).set({ transferPeerId: null }).where(inArray(transactions.transferPeerId, loserIds))
      await tx.update(transactions).set({ transferPeerId: null, subscriptionId: null }).where(inArray(transactions.id, loserIds))
      await tx.delete(transactions).where(inArray(transactions.id, loserIds))
      removed += loserIds.length
    }
  })

  let rehashed = 0
  for (const a of await db.select({ id: accounts.id }).from(accounts)) rehashed += await refreshImportHashes(a.id)
  return { removed, rehashed }
}
