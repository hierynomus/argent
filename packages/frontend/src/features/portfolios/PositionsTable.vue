<script setup lang="ts">
import type { AssetPosition, StockPosition } from "@argent/shared"
import { fmtSymbolCur, pnlColor, pnlFmt } from "../../lib/format"

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
}>()

const columns = () => (props.showDividends ? 9 : 8)
const dividends = (pos: AssetPosition | StockPosition) => ("totalDividends" in pos ? pos.totalDividends : 0)
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4 overflow-x-auto">
    <table class="w-full text-sm" :class="minWidth">
      <thead>
        <tr class="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          <th class="px-4 py-3 text-left">Symbol</th>
          <th class="px-4 py-3 text-left">Name</th>
          <th class="px-4 py-3 text-right">{{ balanceHeader }}</th>
          <th class="px-4 py-3 text-right">Avg cost</th>
          <th class="px-4 py-3 text-right">Current</th>
          <th class="px-4 py-3 text-right">Value</th>
          <th class="px-4 py-3 text-right">Unrealized</th>
          <th class="px-4 py-3 text-right">Realized</th>
          <th v-if="showDividends" class="px-4 py-3 text-right">Dividends</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
        <tr v-if="positions.length === 0">
          <td :colspan="columns()" class="px-4 py-8 text-center text-gray-400 dark:text-gray-500">No positions yet. Record a buy trade below.</td>
        </tr>
        <tr v-for="pos in positions" :key="pos.symbol" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <td class="px-4 py-3 font-mono font-semibold text-indigo-700 dark:text-indigo-300">{{ pos.symbol }}</td>
          <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{{ pos.name }}</td>
          <td class="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">{{ formatBalance(pos.balance) }}</td>
          <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">{{ fmtSymbolCur(pos.avgCostBasis, currency) }}</td>
          <td class="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400">
            <template v-if="pos.currentPrice != null">{{ fmtSymbolCur(pos.currentPrice, currency) }}</template>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </td>
          <td class="px-4 py-3 text-right font-mono text-gray-900 dark:text-gray-100">
            <template v-if="pos.currentValueEur != null">{{ fmtSymbolCur(pos.currentValueEur, currency) }}</template>
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
  </div>
</template>
