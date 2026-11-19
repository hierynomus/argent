<script setup lang="ts">
import { Badge, Card, Td, Th } from "../../components/ui"
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
const isOpen = (pos: AssetPosition | StockPosition) => pos.balance > 1e-10
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
          <Td tone="normal">
            {{ pos.name }}
            <div v-if="heldIn(pos).length > 0" class="text-xs text-gray-400 dark:text-gray-500">in {{ heldIn(pos).join(", ") }}</div>
          </Td>
          <Td align="right" mono tone="strong">{{ formatBalance(pos.balance) }}</Td>
          <Td align="right" mono tone="muted">{{ fmtPrice(pos.avgCostBasis, currency) }}</Td>
          <Td align="right" mono tone="muted">
            <template v-if="pos.currentPrice != null">{{ fmtPrice(pos.currentPrice, currency) }}</template>
            <Badge v-else-if="isOpen(pos)" class="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300" title="No live price found for this symbol, so its value is left out of the totals">no price</Badge>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </Td>
          <Td align="right" mono tone="strong">
            <template v-if="pos.currentValue != null">{{ fmtSymbolCur(pos.currentValue, currency) }}</template>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </Td>
          <Td align="right" mono :class="pos.unrealizedPnL != null ? pnlColor(pos.unrealizedPnL) : 'text-gray-300 dark:text-gray-600'">
            {{ pos.unrealizedPnL != null ? pnlFmt(pos.unrealizedPnL, currency) : "—" }}
          </Td>
          <Td align="right" mono :class="pnlColor(pos.realizedPnL)">{{ pnlFmt(pos.realizedPnL, currency) }}</Td>
          <Td align="right" mono tone="muted" v-if="showDividends">
            <template v-if="dividends(pos) > 0">{{ fmtSymbolCur(dividends(pos), currency) }}</template>
            <span v-else class="text-gray-300 dark:text-gray-600">—</span>
          </Td>
        </tr>
      </tbody>
    </table>
  </Card>
</template>
