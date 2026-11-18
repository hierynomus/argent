import type { Category, TransactionFilters } from "@argent/shared"
import { Input, Select } from "../../components/ui"

/** Search / date range / label filters. Reports changes as a partial filter; the page resets to page 1. */
export function TransactionFiltersBar({ labels, onChange }: { labels: Category[]; onChange: (patch: Partial<TransactionFilters>) => void }) {
  return (
    <div className="flex gap-3 mb-4 flex-wrap">
      <Input density="lg" type="text" placeholder="Search description…" aria-label="Search description" className="w-60 rounded-md" onChange={(e) => onChange({ search: e.target.value })} />
      <Input density="lg" type="date" aria-label="From date" className="rounded-md" onChange={(e) => onChange({ from: e.target.value })} />
      <Input density="lg" type="date" aria-label="To date" className="rounded-md" onChange={(e) => onChange({ to: e.target.value })} />
      <Select density="lg" aria-label="Label" className="rounded-md" onChange={(e) => onChange({ categoryId: e.target.value || undefined })}>
        <option value="">All labels</option>
        <option value="uncategorized">Unlabeled</option>
        {labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
