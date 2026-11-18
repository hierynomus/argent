import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import type { Category, TransactionWithDetails } from "@argent/shared"
import { linkTransfer, unlinkTransfer, useTransferSuggestions } from "../../api"
import { Button, ErrorText, Select, cx } from "../../components/ui"
import { fmtSignedAmount } from "../../lib/format"

/** The amount, signed by its debit/credit indicator. */
export const formatAmount = fmtSignedAmount

/** "Link as transfer": suggests transactions on other accounts that look like the other leg, and links the chosen one. */
export function LinkTransferSection({ tx, onLinked }: { tx: TransactionWithDetails; onLinked: (updated: TransactionWithDetails) => void }) {
  const [open, setOpen] = useState(false)
  const { data: suggestions, isLoading } = useTransferSuggestions(tx.id, open)
  const link = useMutation({ mutationFn: (peerId: string) => linkTransfer(tx.id, { peerId }), onSuccess: onLinked })

  return (
    <div>
      <Button variant="link" className="text-sm" onClick={() => setOpen((v) => !v)}>
        Link as transfer {open ? "▴" : "▾"}
      </Button>
      {open && (
        <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden text-xs">
          {isLoading ? (
            <p className="text-gray-400 dark:text-gray-500 px-3 py-2">Finding suggestions…</p>
          ) : suggestions?.length === 0 ? (
            <p className="text-gray-400 dark:text-gray-500 px-3 py-2">No matching transactions found.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {suggestions?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => link.mutate(s.id)}
                  disabled={link.isPending}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-left disabled:opacity-50"
                >
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{s.account.name ?? s.account.iban}</div>
                    <div className="text-gray-400 dark:text-gray-500">{s.bookingDate}</div>
                  </div>
                  <div className={cx("font-mono font-medium", s.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                    {fmtSignedAmount(s.amount, s.creditDebitIndicator, s.currency)}
                  </div>
                </button>
              ))}
            </div>
          )}
          <ErrorText error={link.error} />
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400 font-medium pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

/** Slide-out with everything about one transaction, plus labelling and transfer linking. Escape or the backdrop closes it. */
export function TransactionDetail({
  tx,
  labels,
  onClose,
  onLabel,
  onTransferChange,
}: {
  tx: TransactionWithDetails
  labels: Category[]
  onClose: () => void
  onLabel: (id: string, categoryId: string | null) => void
  onTransferChange: (updated: TransactionWithDetails) => void
}) {
  const navigate = useNavigate()
  const unlink = useMutation({
    mutationFn: () => unlinkTransfer(tx.id),
    onSuccess: () => onTransferChange({ ...tx, transferPeerId: null, transferPeer: null }),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Transaction details"
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Transaction Details</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className={cx("text-3xl font-bold", tx.creditDebitIndicator === "CRDT" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
            {fmtSignedAmount(tx.amount, tx.creditDebitIndicator, tx.currency)}
          </div>

          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
            <Row label="Booking date">
              <span className="text-gray-900 dark:text-gray-100">{tx.bookingDate}</span>
            </Row>

            {tx.valueDate && tx.valueDate !== tx.bookingDate && (
              <Row label="Value date">
                <span className="text-gray-900 dark:text-gray-100">{tx.valueDate}</span>
              </Row>
            )}

            <Row label="Account">
              <div className="text-gray-900 dark:text-gray-100">{tx.account.name ?? tx.account.iban}</div>
              {tx.account.name && <div className="text-gray-400 dark:text-gray-500 text-xs font-mono mt-0.5">{tx.account.iban}</div>}
            </Row>

            {tx.counterpartyName && !tx.transferPeerId && (
              <Row label="Counterparty">
                <div className="text-gray-900 dark:text-gray-100">{tx.counterpartyName}</div>
                {tx.counterpartyIban && <div className="text-gray-400 dark:text-gray-500 text-xs font-mono mt-0.5">{tx.counterpartyIban}</div>}
              </Row>
            )}

            {tx.description && (
              <Row label="Description">
                <span className="text-gray-900 dark:text-gray-100 break-words">{tx.description}</span>
              </Row>
            )}

            {tx.reference && (
              <Row label="Reference">
                <span className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{tx.reference}</span>
              </Row>
            )}

            <Row label="Transfer">
              {tx.transferPeer ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-700 dark:text-indigo-300 font-medium">↔ {tx.transferPeer.account.name ?? tx.transferPeer.account.iban}</span>
                    <span className="text-gray-400 dark:text-gray-500 text-xs">{tx.transferPeer.bookingDate}</span>
                    <Button variant="danger-link" size="xs" className="ml-auto" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
                      Unlink
                    </Button>
                  </div>
                  <ErrorText error={unlink.error} />
                </>
              ) : (
                <LinkTransferSection tx={tx} onLinked={onTransferChange} />
              )}
            </Row>

            {tx.subscriptionId && (
              <Row label="Subscription">
                <Button
                  variant="link"
                  className="text-sm"
                  onClick={() => {
                    onClose()
                    navigate("/subscriptions")
                  }}
                >
                  ↻ View subscription →
                </Button>
              </Row>
            )}

            <Row label="Label">
              <Select density="sm" aria-label="Label" className="w-full" value={tx.categoryId ?? ""} onChange={(e) => onLabel(tx.id, e.target.value || null)}>
                <option value="">Unlabeled</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Row>
          </dl>
        </div>
      </div>
    </>
  )
}
