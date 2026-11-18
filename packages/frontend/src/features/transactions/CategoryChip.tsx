import type { Category } from "@argent/shared"

/** A label rendered as a pill in its own colour (indigo when it has none). */
export function CategoryChip({ category }: { category: Pick<Category, "name" | "color"> | null }) {
  if (!category) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
  const color = category.color ?? "#6366f1"
  return (
    <span
      className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border"
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}44` }}
    >
      {category.name}
    </span>
  )
}
