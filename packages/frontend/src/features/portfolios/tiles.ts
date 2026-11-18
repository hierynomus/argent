import { fmtSymbolCur, pnlColor, pnlFmt } from "../../lib/format"

export interface Tile {
  label: string
  value: string
  /** tailwind text colour class for the value */
  color?: string
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
