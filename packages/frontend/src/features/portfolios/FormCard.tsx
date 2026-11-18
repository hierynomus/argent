import type { FormEventHandler, ReactNode } from "react"
import { Button, ErrorText } from "../../components/ui"
import { cx } from "../../components/ui"

/** The bordered card + <form> that wraps every "record something" form. */
export function FormCard({ onSubmit, children, className }: { onSubmit: FormEventHandler<HTMLFormElement>; children: ReactNode; className?: string }) {
  return (
    <form onSubmit={onSubmit} className={cx("bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4", className)}>
      {children}
    </form>
  )
}

/** Submit + Cancel row at the bottom of a form, with the server error (if any). */
export function FormActions({
  submitLabel,
  pendingLabel = "Saving…",
  pending,
  error,
  onCancel,
}: {
  submitLabel: string
  pendingLabel?: string
  pending: boolean
  error?: unknown
  onCancel: () => void
}) {
  return (
    <>
      <div className="flex gap-2 pt-3">
        <Button type="submit" size="sm" className="rounded-lg px-4" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <Button variant="muted-link" size="sm" className="rounded-lg px-4 hover:bg-gray-100 dark:hover:bg-gray-800 hover:no-underline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <ErrorText error={error} />
    </>
  )
}
