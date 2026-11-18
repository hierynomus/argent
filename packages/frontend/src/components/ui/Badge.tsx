import type { ReactNode } from "react"
import { cx } from "./cx"

/** Small pill. `tone="role"` styles a viewer/editor role; other tones are for status labels. */
export function RoleBadge({ role }: { role: "viewer" | "editor" | string }) {
  return (
    <span
      className={cx(
        "text-xs px-1.5 py-0.5 rounded font-medium",
        role === "editor"
          ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
      )}
    >
      {role}
    </span>
  )
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cx("inline-block px-2 py-0.5 rounded text-xs font-medium", className)}>{children}</span>
}
