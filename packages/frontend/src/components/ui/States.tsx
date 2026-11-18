import type { ReactNode } from "react"

export function LoadingText({ children = "Loading…" }: { children?: ReactNode }) {
  return <p className="text-gray-400 dark:text-gray-500 text-sm">{children}</p>
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error instanceof Error ? error.message : String(error)}</p>
}

/** The centred "nothing here yet" panel. */
export function EmptyState({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-6 py-12 text-center">
      <p className="text-gray-500 dark:text-gray-400 text-sm">{title}</p>
      {hint && <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">{hint}</p>}
      {children}
    </div>
  )
}
