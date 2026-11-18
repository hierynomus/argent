import { Badge } from "../../components/ui"
import type { DebtPart } from "../../api"

const STYLES: Record<DebtPart["type"], string> = {
  linear: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  annuity: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  interest_only: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
}

export const PART_TYPE_LABELS: Record<DebtPart["type"], string> = {
  linear: "Linear",
  annuity: "Annuity",
  interest_only: "Interest-only",
}

export function TypeBadge({ type }: { type: DebtPart["type"] }) {
  return <Badge className={STYLES[type]}>{PART_TYPE_LABELS[type]}</Badge>
}
