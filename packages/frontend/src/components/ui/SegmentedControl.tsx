import { cx } from "./cx"

/**
 * A row of mutually exclusive buttons (role: viewer/editor, currency: EUR/USD, part type, …).
 * Each option is a real button with `aria-pressed`, so it is keyboard- and screen-reader friendly.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  padding = "px-2.5 py-1",
  capitalize = false,
  className,
}: {
  options: ReadonlyArray<T | { value: T; label: string }>
  value: T
  onChange: (value: T) => void
  /** padding classes for each segment */
  padding?: string
  capitalize?: boolean
  className?: string
}) {
  return (
    <div className={cx("flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm", className)}>
      {options.map((opt) => {
        const { value: v, label } = typeof opt === "string" ? { value: opt, label: opt } : opt
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cx(
              padding,
              capitalize && "capitalize",
              active
                ? "bg-indigo-600 text-white"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
