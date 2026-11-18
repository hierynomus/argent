

// ─── Formatting ──────────────────────────────────────────────────────────────

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 dark:bg-gray-800 rounded animate-pulse ${className}`} />
}
