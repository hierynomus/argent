import { cx } from "../../components/ui"

const ACTIVE = { buy: "bg-green-600 text-white", sell: "bg-red-600 text-white", swap: "bg-blue-600 text-white" } as const

/** Buy / Swap / Sell switch at the top of a trade form (green / blue / red when active). */
export function TradeKindToggle<T extends keyof typeof ACTIVE>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2 mb-4">
      {options.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={kind === value}
          onClick={() => onChange(kind)}
          className={cx(
            "px-4 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize",
            kind === value ? ACTIVE[kind] : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
          )}
        >
          {kind}
        </button>
      ))}
    </div>
  )
}
