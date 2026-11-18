<script setup lang="ts">
import { Card, Th } from "../../components/ui"
import type { AssetPosition, StockPosition } from "@argent/shared"
import { fmtPrice, fmtSymbolCur, pnlColor, pnlFmt } from "../../lib/format"

/**
 * The positions table of a crypto or stock portfolio: one row per symbol with cost basis,
 * live value and P&L. `—` marks values that need a live price we don't have.
 */
const props = defineProps<{
  positions: Array<AssetPosition | StockPosition>
  currency: string
  balanceHeader: string
  formatBalance: (n: number) => string
  showDividends?: boolean
  minWidth: string
  /** the symbol whose chart is open (if any) */
  selectedSymbol?: string | null
}>()
const emit = defineEmits<{ select: [symbol: string] }>()

const heldIn = (pos: AssetPosition | StockPosition) => ((pos as { heldIn?: string[] }).heldIn ?? [])
const columns = () => (props.showDividends ? 9 : 8)
const dividends = (pos: AssetPosition | StockPosition) => ("totalDividends" in pos ? pos.totalDividends : 0)
</script>

<template>
  <Card class="overflow-hidden mb-4 overflow-x-auto">
    <table class="w-full text-sm" :class="minWidth">
      <thead>
        <tr class="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          <Th align="left">Symbol</Th>
          <Th align="left">Name</Th>
          <Th align="right">{{ balanceHeader }}</Th>
          <Th align="right">Avg cost</Th>
          <Th align="right">Current</Th>
          <Th align="right">Value</Th>
          <Th align="right">Unrealized</Th>
          <Th align="right">Realized</Th>
          <Th v-if="showDividends" align="right">Dividends</Th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-if="positions.length === 0">
          <td :colspan="columns()" class="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No positions yet. Record a buy trade below.</td>
        </tr>
        <tr v-for="pos in positions" :key="pos.symbol" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <td class="px-4 py-3 font-mono font-semibold text-indigo-700 dark:text-indigo-300">
            <button type="button" class="hover:underline focus-visible:underline" :aria-pressed="selectedSymbol === pos.symbol" :title="`Show the ${pos.symbol} price chart`" @click="emit('select', pos.symbol)">{{ pos.symbol }}</button>
          </td>
          <td class="px-4 py-3 text-gray-700 dark:text-gray-300">
            {{ pos.name }}
            <div v-if="heldIn(pos).length > 0" class="text-xs text-gray-400 dark:text-gray-500">in {{ heldIn(pos).join(", ") }}</div>
          </td>
          <td class="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">{{ formatBalance(pos.balance) }}</td>
          <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{{ fmtPrice(pos.avgCostBasis, currency) }}</td>
          <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
            <template v-if="pos.currentPrice != null">{{ fmtPrice(pos.currentPrice, currency) }}</template>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </td>
          <td class="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
            <template v-if="pos.currentValue != null">{{ fmtSymbolCur(pos.currentValue, currency) }}</template>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </td>
          <td class="px-4 py-3 text-right font-mono" :class="pos.unrealizedPnL != null ? pnlColor(pos.unrealizedPnL) : 'text-gray-300 dark:text-gray-600'">
            {{ pos.unrealizedPnL != null ? pnlFmt(pos.unrealizedPnL, currency) : "—" }}
          </td>
          <td class="px-4 py-3 text-right font-mono" :class="pnlColor(pos.realizedPnL)">{{ pnlFmt(pos.realizedPnL, currency) }}</td>
          <td v-if="showDividends" class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
            <template v-if="dividends(pos) > 0">{{ fmtSymbolCur(dividends(pos), currency) }}</template>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </Card>
</template>
