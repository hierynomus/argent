import type { TransactionWithDetails } from "@argent/shared"

/**
 * If every selected transaction is a (non-transfer) payment to the same counterparty on the same
 * account, that pair is what a subscription would be created for; otherwise there is no target.
 */
export function subscriptionTargetOf(rows: TransactionWithDetails[], selected: ReadonlySet<string>) {
  const eligible = rows.filter((r) => selected.has(r.id) && r.counterpartyIban && !r.transferPeerId)
  if (eligible.length === 0) return null
  const first = eligible[0]
  const same = eligible.every((r) => r.accountId === first.accountId && r.counterpartyIban === first.counterpartyIban)
  if (!same) return null
  return { accountId: first.accountId, counterpartyIban: first.counterpartyIban!, counterpartyName: first.counterpartyName }
}
