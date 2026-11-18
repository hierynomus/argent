import { Skeleton } from "./Skeleton"

// ─── Summary Tile ─────────────────────────────────────────────────────────────

export function SummaryTile({
  label,
  value,
  sub,
  loading,
}: {
  label: string
  value?: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-5 py-4 flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </p>
      {loading
        ? <Skeleton className="h-7 w-28 mt-0.5" />
        : <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value ?? "—"}</p>
      }
      {sub && !loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
      )}
    </div>
  )
}
