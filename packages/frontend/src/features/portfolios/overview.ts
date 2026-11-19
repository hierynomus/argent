import { sumCents } from "../../lib/money"
import type { AssetPosition, MetalPortfolioDetail, PortfolioDetail, StockPortfolioDetail, StockPosition } from "@argent/shared"

/**
 * Pure aggregation for the "Overview" tab: everything the user can see (the list endpoint already
 * applies access control), summed across portfolios. Portfolios in different currencies are never
 * added together: each currency gets its own group.
 */

export type AssetDetail = PortfolioDetail | StockPortfolioDetail

/** One asset summed over every portfolio (of one currency) that holds it. */
export interface OverviewPosition extends AssetPosition {
  totalDividends: number
  /** names of the portfolios the asset appears in */
  heldIn: string[]
}

export interface AssetGroup {
  currency: string
  portfolioNames: string[]
  positions: OverviewPosition[]
  openCost: number
  /** null when any asset has no price (the same rule as a single portfolio's total) */
  currentValue: number | null
  unrealized: number | null
  realized: number
  dividends: number
  /** the cash in the portfolios' accounts */
  cash: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
/** Sum of values that may be unknown: unknown as soon as one of them is. */
const sumOrNull = (xs: Array<number | null>) => (xs.some((x) => x === null) ? null : sum(xs as number[]))
const dividendsOf = (p: AssetPosition | StockPosition) => ("totalDividends" in p ? p.totalDividends : 0)

/** Crypto and stock portfolios: one row per symbol, grouped by portfolio currency. */
export function aggregateAssets(details: AssetDetail[]): AssetGroup[] {
  const byCurrency = new Map<string, AssetDetail[]>()
  for (const d of details) byCurrency.set(d.currency, [...(byCurrency.get(d.currency) ?? []), d])

  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, group]) => {
      const bySymbol = new Map<string, Array<{ p: AssetPosition | StockPosition; portfolio: string }>>()
      for (const d of group) for (const p of d.positions) bySymbol.set(p.symbol, [...(bySymbol.get(p.symbol) ?? []), { p, portfolio: d.name }])

      const positions: OverviewPosition[] = [...bySymbol.entries()].map(([symbol, entries]) => {
        const balance = sum(entries.map((e) => e.p.balance))
        const totalCost = sum(entries.map((e) => e.p.totalCost))
        const currentValue = sumOrNull(entries.map((e) => e.p.currentValue))
        return {
          symbol,
          name: entries[0].p.name,
          assetForm: entries[0].p.assetForm,
          balance,
          totalCost: totalCost,
          avgCostBasis: balance > 0 ? totalCost / balance : 0,
          currentPrice: entries.map((e) => e.p.currentPrice).find((x) => x !== null) ?? null,
          currentValue: currentValue,
          unrealizedPnL: currentValue === null ? null : currentValue - totalCost,
          realizedPnL: sum(entries.map((e) => e.p.realizedPnL)),
          totalDividends: sum(entries.map((e) => dividendsOf(e.p))),
          heldIn: [...new Set(entries.map((e) => e.portfolio))],
        }
      })
      // biggest holdings first; assets without a price last
      positions.sort((a, b) => (b.currentValue ?? -1) - (a.currentValue ?? -1) || a.symbol.localeCompare(b.symbol))

      const openCost = sum(positions.map((p) => p.totalCost))
      const currentValue = sumOrNull(positions.map((p) => p.currentValue))
      return {
        currency,
        portfolioNames: group.map((d) => d.name),
        positions,
        openCost,
        currentValue,
        unrealized: currentValue === null ? null : currentValue - openCost,
        realized: sum(positions.map((p) => p.realizedPnL)),
        dividends: sum(positions.map((p) => p.totalDividends)),
        cash: sumCents(group.map((d) => d.cash ?? 0)),
      }
    })
}

// ─── Metals ──────────────────────────────────────────────────────────────────

const GRAMS_PER_OUNCE = 31.1034768

/** One metal summed over every lot (in every portfolio of one currency) that still has pieces left. */
export interface MetalRow {
  metal: string
  lots: number
  pieces: number
  grams: number
  cost: number
  value: number | null
  unrealized: number | null
  /** profit/loss already realised by sales, over all lots of the metal */
  realized: number
}

export interface MetalGroup {
  currency: string
  portfolioNames: string[]
  rows: MetalRow[]
  openCost: number
  currentValue: number | null
  unrealized: number | null
  realized: number
}

export function aggregateMetals(details: MetalPortfolioDetail[]): MetalGroup[] {
  const byCurrency = new Map<string, MetalPortfolioDetail[]>()
  for (const d of details) byCurrency.set(d.currency, [...(byCurrency.get(d.currency) ?? []), d])

  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, group]) => {
      const lots = group.flatMap((d) => d.lots)
      const metals = [...new Set(lots.map((l) => l.metal))].sort()
      const rows: MetalRow[] = metals.map((metal) => {
        const all = lots.filter((l) => l.metal === metal)
        const open = all.filter((l) => l.remainingQuantity > 0)
        const grams = sum(open.map((l) => l.remainingQuantity * parseFloat(l.weightPerPiece) * (l.unit === "oz" ? GRAMS_PER_OUNCE : 1)))
        const value = sumOrNull(open.map((l) => (l.currentValuePerPiece === null ? null : l.currentValuePerPiece * l.remainingQuantity)))
        const cost = sum(open.map((l) => l.remainingQuantity * parseFloat(l.pricePerPiece)))
        return {
          metal,
          lots: open.length,
          pieces: sum(open.map((l) => l.remainingQuantity)),
          grams,
          cost,
          value: open.length === 0 ? 0 : value,
          unrealized: open.length === 0 ? 0 : value === null ? null : value - cost,
          realized: sum(all.map((l) => l.realizedPnL)),
        }
      })
      rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.metal.localeCompare(b.metal))

      const openCost = sum(group.map((d) => d.totalInvestedOpen))
      const currentValue = sumOrNull(group.map((d) => d.totalCurrentValueOpen))
      return {
        currency,
        portfolioNames: group.map((d) => d.name),
        rows,
        openCost,
        currentValue,
        unrealized: currentValue === null ? null : currentValue - openCost,
        realized: sum(group.map((d) => d.totalRealizedPnL)),
      }
    })
}
