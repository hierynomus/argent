import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { portfolioApis, useInvalidate, type PortfolioKind } from "../../api"
import { SharingPanel, type SharingMember } from "../../components/SharingPanel"
import { Button, ConfirmButton } from "../../components/ui"

/** Owner-only footer of a portfolio: share it with groups, or delete it. */
export function PortfolioActions({
  kind,
  portfolio,
  onDeleted,
}: {
  kind: PortfolioKind
  portfolio: { id: string; members: SharingMember[] }
  onDeleted: () => void
}) {
  const api = portfolioApis[kind]
  const invalidate = useInvalidate()
  const [showAccess, setShowAccess] = useState(false)
  const refresh = () => invalidate.portfolios(kind)

  const remove = useMutation({
    mutationFn: () => api.remove(portfolio.id),
    onSuccess: () => {
      refresh()
      onDeleted()
    },
  })

  return (
    <div className="mt-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <Button variant="muted-link" onClick={() => setShowAccess((v) => !v)}>
          {showAccess ? "Hide access" : "Share"}
        </Button>
        <div className="flex items-center gap-3">
          <ConfirmButton label="Delete portfolio" prompt="Delete portfolio?" onConfirm={() => remove.mutate()} />
        </div>
      </div>

      {showAccess && (
        <div className="px-4 py-4">
          <SharingPanel
            members={portfolio.members}
            onAdd={(m) => api.addMember(portfolio.id, m).then(refresh)}
            onRemove={(group) => api.removeMember(portfolio.id, group).then(refresh)}
          />
        </div>
      )}
    </div>
  )
}
