import { useState } from "react"
import { Button } from "./Button"

/**
 * A destructive action that needs a second click.
 *
 *   <ConfirmButton label="Delete mortgage" prompt="Delete mortgage?" onConfirm={…} />   → "Delete mortgage?  Yes  No"
 *   <ConfirmButton label="Delete" onConfirm={…} />                                      → "Sure?  No"
 */
export function ConfirmButton({
  label,
  prompt,
  confirmLabel,
  onConfirm,
  onStart,
  disabled,
}: {
  label: string
  /** text shown before the Yes/No buttons; without it the confirm button itself reads "Sure?" */
  prompt?: string
  confirmLabel?: string
  onConfirm: () => void
  /** called when the user starts the deletion (e.g. to close an edit form) */
  onStart?: () => void
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <Button
        variant="danger-link"
        size="xs"
        disabled={disabled}
        onClick={() => {
          onStart?.()
          setConfirming(true)
        }}
      >
        {label}
      </Button>
    )
  }

  return (
    <>
      {prompt && <span className="text-xs text-gray-500 dark:text-gray-400">{prompt}</span>}
      <button type="button" onClick={onConfirm} className="text-xs text-red-600 dark:text-red-400 font-medium">
        {confirmLabel ?? (prompt ? "Yes" : "Sure?")}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-xs text-gray-400">
        No
      </button>
    </>
  )
}
