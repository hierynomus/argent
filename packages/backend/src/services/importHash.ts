import { sql } from "drizzle-orm"
import { db } from "../db"

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
