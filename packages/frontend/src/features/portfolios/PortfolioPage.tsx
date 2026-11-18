import { useState, type FormEvent, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { portfolioApis, useInvalidate, usePortfolio, usePortfolios, type PortfolioDetailByKind, type PortfolioKind } from "../../api"
import { Button, EmptyState, ErrorText, Input, LoadingText, SegmentedControl, cx } from "../../components/ui"
import { PortfolioActions } from "./PortfolioActions"

type Currency = "EUR" | "USD"

/**
 * The shell shared by Crypto, Precious Metals and Stocks: list of portfolios as tabs, the
 * "new portfolio" form, and the owner actions (share / delete) under the selected portfolio.
 * What a portfolio *contains* is the caller's `renderDetail`.
 */
export function PortfolioPage<K extends PortfolioKind>({
  kind,
  title,
  emptyNoun,
  withBroker = false,
  renderDetail,
}: {
  kind: K
  title: string
  /** used in the empty state: "No {emptyNoun} portfolio yet." */
  emptyNoun: string
  /** stock portfolios belong to a broker */
  withBroker?: boolean
  renderDetail: (portfolio: PortfolioDetailByKind[K]) => ReactNode
}) {
  const api = portfolioApis[kind]
  const invalidate = useInvalidate()
  const { data: portfolios = [], isLoading: loadingList } = usePortfolios(kind)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeId = selectedId ?? portfolios[0]?.id ?? null
  const { data, isLoading: loadingDetail } = usePortfolio(kind, activeId)
  // (TanStack wraps the generic in NoInfer; narrow it back to the kind's detail type)
  const portfolio = data as PortfolioDetailByKind[K] | undefined

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [currency, setCurrency] = useState<Currency>("EUR")
  const [broker, setBroker] = useState("")

  const create = useMutation({
    mutationFn: () => api.create({ name: name.trim(), currency, broker: withBroker ? broker.trim() || undefined : undefined }),
    onSuccess: (created) => {
      invalidate.portfolios(kind)
      setSelectedId(created.id)
      setName("")
      setBroker("")
      setCreating(false)
    },
  })

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }

  if (loadingList) return <LoadingText />

  if (portfolios.length === 0 && !creating) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">{title}</h1>
        <EmptyState title={`No ${emptyNoun} portfolio yet.`}>
          <Button size="md" className="rounded-lg mt-4" onClick={() => setCreating(true)}>
            Create portfolio
          </Button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        <Button size="sm" className="rounded-lg" onClick={() => setCreating(true)}>
          + New portfolio
        </Button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="mb-6 flex gap-2 flex-wrap items-center">
          <Input autoFocus density="lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Portfolio name" aria-label="Portfolio name" className="flex-1 min-w-40 !py-2 rounded-lg" />
          {withBroker && (
            <Input density="lg" value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="Broker (e.g. DEGIRO)" aria-label="Broker" className="flex-1 min-w-40 !py-2 rounded-lg" />
          )}
          <SegmentedControl options={["EUR", "USD"] as const} value={currency} onChange={setCurrency} padding="px-3 py-2 font-medium" className="rounded-lg" />
          <Button type="submit" size="md" className="rounded-lg" disabled={create.isPending}>
            Create
          </Button>
          <Button variant="muted-link" size="md" className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setCreating(false)}>
            Cancel
          </Button>
          <ErrorText error={create.error} />
        </form>
      )}

      {portfolios.length > 1 && (
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
          {portfolios.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={cx(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeId === p.id
                  ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
              )}
            >
              {p.name}
              {p.broker && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({p.broker})</span>}
            </button>
          ))}
        </div>
      )}

      {loadingDetail && <LoadingText>Loading portfolio…</LoadingText>}
      {portfolio && (
        <>
          {renderDetail(portfolio)}
          {portfolio.isOwner && <PortfolioActions kind={kind} portfolio={portfolio} onDeleted={() => setSelectedId(null)} />}
        </>
      )}
    </div>
  )
}
