import type { Account } from "@argent/shared"

// ─── Account Selector ─────────────────────────────────────────────────────────

export function AccountSelector({
  accounts,
  selected,
  onChange,
}: {
  accounts: Account[]
  selected: Set<string>
  onChange: (ids: Set<string>) => void
}) {
  const allSelected = selected.size === 0

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        type="button"
        aria-pressed={allSelected}
        onClick={() => onChange(new Set())}
        className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
          allSelected
            ? "bg-indigo-600 text-white border-indigo-600"
            : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
        }`}
      >
        All accounts
      </button>
      {accounts.map((acc) => {
        const active = selected.has(acc.id)
        return (
          <button
            key={acc.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(acc.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              active
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            {acc.name ?? acc.iban}
          </button>
        )
      })}
    </div>
  )
}
