import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { runSubscriptionDetection, useAccounts, useInvalidate, useSubscriptions } from "../api"
import { Button, EmptyState, LoadingText, cx } from "../components/ui"
import { AddSubscriptionForm } from "../features/subscriptions/AddSubscriptionForm"
import { CandidateCard } from "../features/subscriptions/CandidateCard"
import { SubscriptionRow } from "../features/subscriptions/SubscriptionRow"

type Tab = "confirmed" | "candidates"

const tabClass = (active: boolean) =>
  cx(
    "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
    active
      ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
  )

/** Recurring payments: the ones you track ("My Subscriptions") and the ones the detector suggests ("Discovered"). */
export default function SubscriptionsPage() {
  const invalidate = useInvalidate()
  const [tab, setTab] = useState<Tab>("confirmed")
  const [showAddForm, setShowAddForm] = useState(false)
  const [detectNote, setDetectNote] = useState<string | null>(null)

  const { data: subs = [], isLoading } = useSubscriptions()
  const { data: accounts = [] } = useAccounts()
  const candidates = subs.filter((s) => s.status === "candidate")
  const confirmed = subs.filter((s) => s.status === "confirmed")

  const detect = useMutation({
    mutationFn: runSubscriptionDetection,
    onSuccess: ({ detected }) => {
      if (detected > 0) {
        invalidate.subscriptions()
        setTab("candidates")
        setDetectNote(null)
      } else {
        setDetectNote("No new recurring patterns found.")
      }
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Subscriptions</h1>
        <div className="flex items-center gap-2">
          {tab === "confirmed" && (
            <Button variant="secondary" className="rounded-md" onClick={() => setShowAddForm((v) => !v)}>
              + Add
            </Button>
          )}
          {tab === "candidates" && (
            <Button className="rounded-md" disabled={detect.isPending} onClick={() => detect.mutate()}>
              {detect.isPending ? "Detecting…" : "Run Detection"}
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex -mb-px">
          <button type="button" className={tabClass(tab === "confirmed")} onClick={() => setTab("confirmed")}>
            My Subscriptions
          </button>
          <button type="button" className={tabClass(tab === "candidates")} onClick={() => setTab("candidates")}>
            Discovered
            {candidates.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                {candidates.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {isLoading ? (
        <LoadingText />
      ) : tab === "confirmed" ? (
        <div className="flex flex-col gap-4">
          {showAddForm && accounts.length > 0 && <AddSubscriptionForm accounts={accounts} onDone={() => setShowAddForm(false)} />}
          {confirmed.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-5 py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No confirmed subscriptions yet.</p>
              {candidates.length > 0 ? (
                <Button variant="link" className="font-normal" onClick={() => setTab("candidates")}>
                  {candidates.length} suggestion{candidates.length !== 1 ? "s" : ""} waiting in Discovered →
                </Button>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 text-xs">Import transactions and use the Discovered tab to find recurring patterns, or add one manually.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {confirmed.map((sub) => (
                <SubscriptionRow key={sub.id} sub={sub} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {detectNote && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">{detectNote}</p>}
          {candidates.length === 0 ? (
            <EmptyState title='No suggestions found. Click "Run Detection" to search for recurring payments.' />
          ) : (
            candidates.map((sub) => <CandidateCard key={sub.id} sub={sub} />)
          )}
        </div>
      )}
    </div>
  )
}
