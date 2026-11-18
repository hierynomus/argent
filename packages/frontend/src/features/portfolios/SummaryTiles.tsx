import { pnlColor, pnlFmt, fmtSymbolCur } from "../../lib/format"

export interface Tile {
  label: string
  value: string
  /** tailwind text colour class for the value */
  color?: string
}

/** The row of headline numbers above a portfolio. `—` means "not available" (e.g. no live price). */
export function SummaryTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className={`grid grid-cols-2 gap-4 mb-4 ${tiles.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      {tiles.map(({ label, value, color }) => (
        <div key={label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
          <p className={`text-lg font-semibold ${color ?? "text-gray-900 dark:text-gray-100"}`}>{value}</p>
        </div>
      ))}
    </div>
  )
}

/** The four tiles every portfolio shows, from values that may be missing (no price). */
export function standardTiles(
  p: { openCost: number; currentValue: number | null; unrealized: number | null; realized: number },
  currency: string,
): Tile[] {
  return [
    { label: "Open cost", value: fmtSymbolCur(p.openCost, currency) },
    { label: "Current value", value: p.currentValue != null ? fmtSymbolCur(p.currentValue, currency) : "—" },
    {
      label: "Unrealized P&L",
      value: p.unrealized != null ? pnlFmt(p.unrealized, currency) : "—",
      color: p.unrealized != null ? pnlColor(p.unrealized) : undefined,
    },
    { label: "Realized P&L", value: pnlFmt(p.realized, currency), color: pnlColor(p.realized) },
  ]
}
